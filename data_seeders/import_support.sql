BEGIN;
-- Function EXECUTE is granted to PUBLIC globally by PostgreSQL by default.
-- A per-schema REVOKE alone cannot remove that global default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS total_rows bigint NOT NULL DEFAULT 0 CHECK (total_rows>=0);
ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS warning_rows bigint NOT NULL DEFAULT 0 CHECK (warning_rows>=0);
ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS encoding text;
ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS delimiter text;
ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.import_runs ADD COLUMN IF NOT EXISTS safe_error text;
ALTER TABLE public.import_issues ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('warning','error'));
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS signup_precision text NOT NULL DEFAULT 'timestamp' CHECK (signup_precision IN ('timestamp','date','unknown'));
-- Contact exports contain suppression status but no time when it happened.
-- NULL represents an unknown occurrence time; never substitute signup time.
ALTER TABLE public.contact_suppressions ALTER COLUMN occurred_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.legacy_send_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.brands(id),
 batch_key text NOT NULL CHECK (btrim(batch_key)<>''),
 campaign_id uuid NOT NULL,
 queued_at timestamptz NOT NULL,
 recipient_count bigint NOT NULL CHECK (recipient_count>=0),
 status text NOT NULL CHECK (status IN ('sent','failed','queued')),
 UNIQUE (brand_id,batch_key),
 FOREIGN KEY (brand_id,campaign_id) REFERENCES public.campaigns(brand_id,id)
);
ALTER TABLE public.legacy_send_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_send_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_send_batches FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.legacy_send_batches TO authenticated;
GRANT ALL ON public.legacy_send_batches TO service_role;
DROP POLICY IF EXISTS tenant_read ON public.legacy_send_batches;
CREATE POLICY tenant_read ON public.legacy_send_batches FOR SELECT TO authenticated
 USING (brand_id=(SELECT vg_private.current_brand_id()));

-- Views execute with the caller's rights, preserving underlying table RLS.
-- Historical bounce/status without a channel conservatively suppresses both.
-- Known event channels suppress only that channel. No implied re-subscription.
CREATE OR REPLACE VIEW public.contact_eligibility WITH (security_invoker=true) AS
SELECT c.id,c.brand_id,c.external_id,c.signup_at,c.signup_precision,c.deleted_at,
 (c.status='active' AND c.consent_marketing AND c.deleted_at IS NULL
  AND (c.suppressed_until IS NULL OR c.suppressed_until<=now())
  AND c.email_valid AND c.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.contact_suppressions s
    WHERE s.brand_id=c.brand_id AND s.contact_id=c.id AND s.channel='email')) AS email_contactable,
 (c.status='active' AND c.consent_marketing AND c.deleted_at IS NULL
  AND (c.suppressed_until IS NULL OR c.suppressed_until<=now())
  AND c.phone_valid AND c.phone IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.contact_suppressions s
    WHERE s.brand_id=c.brand_id AND s.contact_id=c.id AND s.channel='sms')) AS sms_contactable
FROM public.contacts c;
REVOKE ALL ON public.contact_eligibility FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.contact_eligibility TO authenticated,service_role;
COMMIT;
