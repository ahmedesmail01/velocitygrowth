-- Velocity Growth portal: migration 01, database and membership foundation.
BEGIN;

CREATE SCHEMA vg_private;
REVOKE ALL ON SCHEMA vg_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA vg_private TO authenticated, service_role;

-- New postgres-owned objects fail closed. Future migrations grant access explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA vg_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code IN ('KILELE','KAROO','MARRAKECH')),
  name text NOT NULL,
  timezone text NOT NULL
);
INSERT INTO public.brands (code,name,timezone) VALUES
 ('KILELE','Kilele Rides','Africa/Nairobi'),
 ('KAROO','Karoo Coaches','Africa/Johannesburg'),
 ('MARRAKECH','Marrakech Express','Africa/Casablanca');

-- Administrators own this allowlist; never populate it from signup metadata.
CREATE TABLE vg_private.approved_accounts (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND position('@' IN email)>1),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  role text NOT NULL CHECK (role IN ('owner','analyst')),
  UNIQUE (brand_id,role)
);
INSERT INTO vg_private.approved_accounts (email,brand_id,role)
 SELECT 'ahmedesmail34180@gmail.com',id,'owner' FROM public.brands WHERE code='KAROO';
INSERT INTO vg_private.approved_accounts (email,brand_id,role)
 SELECT 'ahmedesmailofficial01@gmail.com',id,'analyst' FROM public.brands WHERE code='KILELE';

CREATE TABLE public.brand_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  role text NOT NULL CHECK (role IN ('owner','analyst')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id,role)
);

CREATE FUNCTION vg_private.current_brand_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT brand_id FROM public.brand_memberships
      WHERE user_id=(SELECT auth.uid()) AND active $$;
CREATE FUNCTION vg_private.is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS (SELECT 1 FROM public.brand_memberships
      WHERE user_id=(SELECT auth.uid()) AND active AND role='owner') $$;
REVOKE ALL ON FUNCTION vg_private.current_brand_id(), vg_private.is_owner()
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION vg_private.current_brand_id(), vg_private.is_owner()
 TO authenticated;

-- Bind only confirmed identities. An unknown Auth user has zero portal access.
-- Supabase can create an unconfirmed user before email verification completes.
CREATE FUNCTION vg_private.bind_approved_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF NEW.email_confirmed_at IS NOT NULL THEN
   INSERT INTO public.brand_memberships (user_id,brand_id,role)
   SELECT NEW.id,a.brand_id,a.role FROM vg_private.approved_accounts a
   WHERE a.email=lower(btrim(NEW.email))
   ON CONFLICT (user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION vg_private.bind_approved_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER vg_bind_approved_user
 AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
 FOR EACH ROW EXECUTE FUNCTION vg_private.bind_approved_user();
INSERT INTO public.brand_memberships (user_id,brand_id,role)
 SELECT u.id,a.brand_id,a.role FROM auth.users u
 JOIN vg_private.approved_accounts a ON a.email=lower(btrim(u.email))
 WHERE u.email_confirmed_at IS NOT NULL;

CREATE TABLE public.contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 external_id text NOT NULL CHECK (btrim(external_id)<>''),
 full_name text NOT NULL CHECK (btrim(full_name)<>''),
 email text, phone text, country text CHECK (country ~ '^[A-Z]{2}$'), city text,
 signup_at timestamptz,
 status text NOT NULL CHECK (status IN ('active','pending','bounced','unsubscribed')),
 consent_marketing boolean NOT NULL DEFAULT false,
 email_valid boolean NOT NULL DEFAULT false,
 phone_valid boolean NOT NULL DEFAULT false,
 deleted_at timestamptz, suppressed_until timestamptz,
 source_version date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (brand_id,external_id), UNIQUE (brand_id,id)
);
CREATE INDEX contacts_brand_signup ON public.contacts (brand_id,signup_at,id);
CREATE INDEX contacts_brand_name ON public.contacts (brand_id,full_name,id);

CREATE TABLE public.campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 external_id text NOT NULL CHECK (btrim(external_id)<>''),
 name text NOT NULL CHECK (btrim(name)<>''),
 channel text NOT NULL CHECK (channel IN ('email','sms')),
 target_country text CHECK (target_country ~ '^[A-Z]{2}$'),
 parent_id uuid,
 reported_sent bigint CHECK (reported_sent>=0),
 reported_delivered bigint CHECK (reported_delivered>=0),
 reported_bounced bigint CHECK (reported_bounced>=0),
 reported_opens bigint CHECK (reported_opens>=0),
 reported_clicks bigint CHECK (reported_clicks>=0),
 spend numeric(16,2) CHECK (spend>=0),
 sent_at timestamptz,
 UNIQUE (brand_id,external_id), UNIQUE (brand_id,id),
 FOREIGN KEY (brand_id,parent_id) REFERENCES public.campaigns(brand_id,id),
 CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX campaigns_brand_sent ON public.campaigns (brand_id,sent_at,id);

CREATE TABLE public.import_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 filename text NOT NULL,
 file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','running','completed','failed')),
 accepted_rows bigint NOT NULL DEFAULT 0 CHECK (accepted_rows>=0),
 rejected_rows bigint NOT NULL DEFAULT 0 CHECK (rejected_rows>=0),
 duplicate_rows bigint NOT NULL DEFAULT 0 CHECK (duplicate_rows>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (brand_id,file_sha256), UNIQUE (brand_id,id)
);
-- Only sanitized explanations are visible here. Raw rejected rows may contain
-- another brand's data and belong exclusively in the private quarantine table.
CREATE TABLE public.import_issues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 import_id uuid NOT NULL,
 row_number bigint NOT NULL CHECK (row_number>0),
 code text NOT NULL,
 safe_message text NOT NULL,
 FOREIGN KEY (brand_id,import_id) REFERENCES public.import_runs(brand_id,id)
);
CREATE INDEX import_issues_run ON public.import_issues(brand_id,import_id,row_number);
CREATE TABLE vg_private.import_quarantine (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 import_id uuid NOT NULL,
 row_number bigint NOT NULL CHECK (row_number>0),
 raw_record jsonb NOT NULL,
 FOREIGN KEY (brand_id,import_id) REFERENCES public.import_runs(brand_id,id)
);

CREATE TABLE public.engagement_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 source text NOT NULL CHECK (source IN ('seed','provider')),
 external_event_id text NOT NULL CHECK (btrim(external_event_id)<>''),
 contact_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 event_type text NOT NULL CHECK (event_type IN ('delivered','bounce','open','click','unsubscribe','complaint')),
 channel text NOT NULL CHECK (channel IN ('email','sms')),
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (brand_id,source,external_event_id), UNIQUE (brand_id,id),
 FOREIGN KEY (brand_id,contact_id) REFERENCES public.contacts(brand_id,id),
 FOREIGN KEY (brand_id,campaign_id) REFERENCES public.campaigns(brand_id,id)
);
CREATE INDEX events_campaign ON public.engagement_events(brand_id,campaign_id,event_type,contact_id);
CREATE INDEX events_contact ON public.engagement_events(brand_id,contact_id,occurred_at);

CREATE TABLE public.contact_suppressions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 contact_id uuid NOT NULL,
 channel text NOT NULL CHECK (channel IN ('email','sms')),
 reason text NOT NULL CHECK (reason IN ('bounce','unsubscribe','complaint')),
 occurred_at timestamptz NOT NULL,
 UNIQUE (brand_id,contact_id,channel,reason),
 FOREIGN KEY (brand_id,contact_id) REFERENCES public.contacts(brand_id,id)
);

-- Tenant isolation lives in these policies. No client write grants are issued.
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.brands FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.brands TO authenticated;
CREATE POLICY own_brand ON public.brands FOR SELECT TO authenticated
 USING (id=(SELECT vg_private.current_brand_id()));

ALTER TABLE public.brand_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_memberships FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_memberships FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.brand_memberships TO authenticated;
CREATE POLICY own_membership ON public.brand_memberships FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) AND active);

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['contacts','campaigns','import_runs','import_issues',
                         'engagement_events','contact_suppressions'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING (brand_id=(SELECT vg_private.current_brand_id()))',t);
   EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END;
$$;
GRANT ALL ON public.brands,public.brand_memberships TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA vg_private FROM PUBLIC,anon,authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA vg_private TO service_role;

-- Service operations still need explicit tenant checks. service_role bypasses RLS.
-- Future send/share migrations will add narrow owner-authorized RPCs.
COMMIT;

SELECT 'Foundation installed; create the two Auth users next.' AS result;
SELECT code,name,timezone FROM public.brands ORDER BY code;
