-- Run in Supabase SQL Editor after migrations 01–03. Run ONCE.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.send_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL REFERENCES public.brands(id),
 campaign_id uuid NOT NULL, campaign_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'preview' CHECK(status IN('preview','cancelled','queued','dispatching','accepted','partial','uncertain','blocked')),
 recipient_count integer NOT NULL DEFAULT 0 CHECK(recipient_count BETWEEN 0 AND 100000),
 accepted_count integer NOT NULL DEFAULT 0 CHECK(accepted_count>=0),
 rejected_count integer NOT NULL DEFAULT 0 CHECK(rejected_count>=0),
 delivered_count integer NOT NULL DEFAULT 0, opened_count integer NOT NULL DEFAULT 0,
 bounced_count integer NOT NULL DEFAULT 0, unsubscribed_count integer NOT NULL DEFAULT 0,
 issue_count integer NOT NULL DEFAULT 0,
 provider_batch_id text, safe_message text,
 created_at timestamptz NOT NULL DEFAULT now(), preview_expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 approved_at timestamptz, approved_by uuid REFERENCES auth.users(id), last_synced_at timestamptz,
 UNIQUE(brand_id,id), FOREIGN KEY(brand_id,campaign_id) REFERENCES public.campaigns(brand_id,id)
);
-- A campaign can have one active/attempted send. Cancelled previews and runs
-- blocked BEFORE their first attempt permit another preview; history is retained.
CREATE UNIQUE INDEX one_campaign_send ON public.send_runs(brand_id,campaign_id) WHERE status NOT IN('cancelled','blocked');
CREATE TABLE public.send_recipients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
 run_id uuid NOT NULL, contact_id uuid NOT NULL, full_name text NOT NULL,
 destination text NOT NULL, channel text NOT NULL CHECK(channel IN('email','sms')),
 UNIQUE(run_id,destination), UNIQUE(run_id,id),
 FOREIGN KEY(brand_id,run_id) REFERENCES public.send_runs(brand_id,id),
 FOREIGN KEY(brand_id,contact_id) REFERENCES public.contacts(brand_id,id)
);
CREATE TABLE public.send_receipts (
 brand_id uuid NOT NULL, run_id uuid NOT NULL, recipient_id uuid PRIMARY KEY,
 accepted boolean NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(brand_id,run_id) REFERENCES public.send_runs(brand_id,id),
 FOREIGN KEY(run_id,recipient_id) REFERENCES public.send_recipients(run_id,id)
);
CREATE INDEX send_recipients_page ON public.send_recipients(brand_id,run_id,full_name,id);
CREATE INDEX contacts_email_destination ON public.contacts(brand_id,email) WHERE email IS NOT NULL;
CREATE INDEX contacts_phone_destination ON public.contacts(brand_id,phone) WHERE phone IS NOT NULL;
CREATE TABLE vg_private.send_jobs (
 run_id uuid PRIMARY KEY REFERENCES public.send_runs(id), payload jsonb NOT NULL,
 idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), attempts integer NOT NULL DEFAULT 0,
 lease_token uuid, lease_until timestamptz, next_attempt timestamptz NOT NULL DEFAULT now(),
 cursor_value text, next_poll timestamptz NOT NULL DEFAULT now(),
 poll_token uuid, poll_until timestamptz, poll_count integer NOT NULL DEFAULT 0
);
CREATE TABLE vg_private.provider_events (
 run_id uuid NOT NULL REFERENCES public.send_runs(id), event_id text NOT NULL,
 recipient_id uuid NOT NULL, event_type text NOT NULL CHECK(event_type IN('delivered','open','bounce','unsubscribe')),
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(run_id,event_id), FOREIGN KEY(run_id,recipient_id) REFERENCES public.send_recipients(run_id,id)
);
CREATE INDEX provider_events_recipient ON vg_private.provider_events(run_id,event_type,recipient_id);
CREATE TABLE vg_private.provider_issues (
 run_id uuid NOT NULL REFERENCES public.send_runs(id), fingerprint text NOT NULL,
 code text NOT NULL, raw_event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,fingerprint)
);

CREATE FUNCTION vg_private.freeze_approval() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Approved history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND OLD.approved_at IS NOT NULL AND
  (NEW.brand_id,NEW.campaign_id,NEW.campaign_snapshot,NEW.recipient_count,NEW.approved_at,NEW.approved_by,NEW.created_at)
  IS DISTINCT FROM (OLD.brand_id,OLD.campaign_id,OLD.campaign_snapshot,OLD.recipient_count,OLD.approved_at,OLD.approved_by,OLD.created_at)
 THEN RAISE EXCEPTION 'Approved history is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER freeze_approval BEFORE UPDATE OR DELETE ON public.send_runs FOR EACH ROW EXECUTE FUNCTION vg_private.freeze_approval();
CREATE FUNCTION vg_private.freeze_recipients() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
 IF TG_OP='INSERT' THEN rid=NEW.run_id; ELSE rid=OLD.run_id; END IF;
 IF EXISTS(SELECT 1 FROM public.send_runs WHERE id=rid AND approved_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Approved recipients are immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.run_id<>OLD.run_id THEN RAISE EXCEPTION 'Cannot move recipients'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER freeze_recipients BEFORE INSERT OR UPDATE OR DELETE ON public.send_recipients FOR EACH ROW EXECUTE FUNCTION vg_private.freeze_recipients();

CREATE FUNCTION vg_private.eligible_destinations(p_campaign uuid)
RETURNS TABLE(contact_id uuid,full_name text,destination text,channel text)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT DISTINCT ON (CASE WHEN p.channel='email' THEN c.email ELSE c.phone END)
  c.id,c.full_name,CASE WHEN p.channel='email' THEN c.email ELSE c.phone END,p.channel
 FROM public.campaigns p JOIN public.contacts c ON c.brand_id=p.brand_id
 JOIN public.contact_eligibility e ON e.brand_id=c.brand_id AND e.id=c.id
 WHERE p.id=p_campaign AND (p.target_country IS NULL OR p.target_country=c.country)
 AND CASE WHEN p.channel='email' THEN e.email_contactable ELSE e.sms_contactable END
 -- An unsubscribe on an alias sharing this destination must suppress the address.
 AND NOT EXISTS(SELECT 1 FROM public.contacts alias JOIN public.contact_suppressions s
  ON s.brand_id=alias.brand_id AND s.contact_id=alias.id AND s.channel=p.channel
  WHERE alias.brand_id=c.brand_id AND
   CASE WHEN p.channel='email' THEN alias.email=c.email ELSE alias.phone=c.phone END)
 ORDER BY CASE WHEN p.channel='email' THEN c.email ELSE c.phone END,c.id;
$$;

CREATE FUNCTION public.portal_prepare_send(p_campaign_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b uuid; p public.campaigns; r public.send_runs; n integer;
BEGIN
 b=vg_private.current_brand_id();
 IF b IS NULL OR NOT vg_private.is_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.campaigns WHERE id=p_campaign_id AND brand_id=b FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.send_runs WHERE brand_id=b AND campaign_id=p.id AND status NOT IN('cancelled','blocked') FOR UPDATE;
 IF FOUND THEN RETURN to_jsonb(r); END IF;
 INSERT INTO public.send_runs(brand_id,campaign_id,campaign_snapshot)
 VALUES(b,p.id,jsonb_build_object('name',p.name,'external_id',p.external_id,'channel',p.channel,'target_country',p.target_country)) RETURNING * INTO r;
 INSERT INTO public.send_recipients(brand_id,run_id,contact_id,full_name,destination,channel)
 SELECT b,r.id,x.contact_id,x.full_name,x.destination,x.channel FROM vg_private.eligible_destinations(p.id) x;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.send_runs SET recipient_count=n WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END; $$;

CREATE FUNCTION public.portal_cancel_preview(p_run_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT vg_private.is_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 UPDATE public.send_runs SET status='cancelled' WHERE id=p_run_id AND brand_id=vg_private.current_brand_id() AND status='preview' AND approved_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Preview unavailable'; END IF;
END; $$;

CREATE FUNCTION public.portal_confirm_send(p_run_id uuid,p_expected_count integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.send_runs; p public.campaigns; payload jsonb;
BEGIN
 IF NOT vg_private.is_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.send_runs WHERE id=p_run_id AND brand_id=vg_private.current_brand_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Send unavailable' USING ERRCODE='42501'; END IF;
 IF r.approved_at IS NOT NULL THEN RETURN to_jsonb(r); END IF;
 IF r.status<>'preview' OR r.recipient_count=0 OR p_expected_count IS DISTINCT FROM r.recipient_count THEN RAISE EXCEPTION 'Invalid approval'; END IF;
 SELECT * INTO p FROM public.campaigns WHERE id=r.campaign_id AND brand_id=r.brand_id;
 IF r.preview_expires_at<now() OR r.campaign_snapshot IS DISTINCT FROM
  jsonb_build_object('name',p.name,'external_id',p.external_id,'channel',p.channel,'target_country',p.target_country)
 OR EXISTS(SELECT contact_id,destination FROM public.send_recipients WHERE run_id=r.id
  EXCEPT SELECT contact_id,destination FROM vg_private.eligible_destinations(r.campaign_id)) THEN
  UPDATE public.send_runs SET status='cancelled',safe_message='Preview expired or recipients changed. Create a new preview.' WHERE id=r.id RETURNING * INTO r;
  RETURN to_jsonb(r);
 END IF;
 SELECT jsonb_build_object('campaign',r.campaign_snapshot->>'name','brand',b.code,
 'recipients',(SELECT jsonb_agg(jsonb_build_object('id',s.id::text,'channel',s.channel)||
  CASE WHEN s.channel='email' THEN jsonb_build_object('email',s.destination) ELSE jsonb_build_object('phone',s.destination) END ORDER BY s.id)
 FROM public.send_recipients s WHERE s.run_id=r.id)) INTO payload FROM public.brands b WHERE b.id=r.brand_id;
 INSERT INTO vg_private.send_jobs(run_id,payload) VALUES(r.id,payload);
 UPDATE public.send_runs SET status='queued',approved_at=now(),approved_by=auth.uid(),safe_message=NULL WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END; $$;

-- Worker endpoints are granted ONLY to service_role. Never put that key in a browser.
CREATE FUNCTION public.worker_claim_send() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j vg_private.send_jobs; r public.send_runs; token uuid;
BEGIN
 SELECT q.* INTO j FROM vg_private.send_jobs q JOIN public.send_runs s ON s.id=q.run_id
 WHERE s.status IN('queued','dispatching','uncertain') AND s.provider_batch_id IS NULL
 AND q.next_attempt<=now() AND (q.lease_until IS NULL OR q.lease_until<now())
 ORDER BY s.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.send_runs WHERE id=j.run_id FOR UPDATE;
 IF j.attempts=0 AND EXISTS(SELECT contact_id,destination FROM public.send_recipients WHERE run_id=r.id
   EXCEPT SELECT contact_id,destination FROM vg_private.eligible_destinations(r.campaign_id)) THEN
  UPDATE public.send_runs SET status='blocked',safe_message='Eligibility changed after approval. No dispatch was attempted.' WHERE id=r.id;
  RETURN NULL;
 END IF;
 token=gen_random_uuid();
 UPDATE vg_private.send_jobs SET lease_token=token,lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE run_id=r.id;
 UPDATE public.send_runs SET status='dispatching',safe_message=NULL WHERE id=r.id;
 RETURN jsonb_build_object('run_id',r.id,'lease_token',token,'idempotency_key',j.idempotency_key,'payload',j.payload);
END; $$;

CREATE FUNCTION public.worker_dispatch_failed(p_run uuid,p_lease uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE vg_private.send_jobs SET lease_until=NULL,next_attempt=now()+interval '60 seconds'
 WHERE run_id=p_run AND lease_token=p_lease;
 IF FOUND THEN UPDATE public.send_runs SET status='uncertain',safe_message='Dispatch outcome is uncertain. Retrying the same approved request safely.' WHERE id=p_run AND provider_batch_id IS NULL; END IF;
END; $$;

CREATE FUNCTION public.worker_dispatch_complete(p_run uuid,p_lease uuid,p_batch text,p_accepted text[],p_rejected text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; total integer;
BEGIN
 PERFORM 1 FROM vg_private.send_jobs WHERE run_id=p_run AND lease_token=p_lease FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale worker lease'; END IF;
 IF p_batch IS NULL OR length(p_batch) NOT BETWEEN 1 AND 200 OR p_accepted IS NULL OR p_rejected IS NULL THEN RAISE EXCEPTION 'Invalid provider acknowledgement'; END IF;
 SELECT recipient_count INTO total FROM public.send_runs WHERE id=p_run;
 SELECT count(DISTINCT x) INTO n FROM unnest(p_accepted||p_rejected) x;
 IF n<>total OR cardinality(p_accepted)+cardinality(p_rejected)<>total OR
  EXISTS(SELECT x FROM unnest(p_accepted||p_rejected) x EXCEPT SELECT id::text FROM public.send_recipients WHERE run_id=p_run)
 THEN RAISE EXCEPTION 'Provider recipient acknowledgement does not reconcile'; END IF;
 INSERT INTO public.send_receipts(brand_id,run_id,recipient_id,accepted) SELECT brand_id,run_id,id,id::text=ANY(p_accepted) FROM public.send_recipients WHERE run_id=p_run;
 UPDATE public.send_runs SET provider_batch_id=p_batch,accepted_count=cardinality(p_accepted),rejected_count=cardinality(p_rejected),
 status=CASE WHEN cardinality(p_rejected)=0 THEN 'accepted' ELSE 'partial' END,
 safe_message=CASE WHEN cardinality(p_rejected)>0 THEN 'The provider rejected some approved recipients. They will not be resubmitted automatically.' ELSE NULL END WHERE id=p_run;
 UPDATE vg_private.send_jobs SET lease_until=NULL,next_poll=now() WHERE run_id=p_run;
END; $$;

CREATE FUNCTION public.worker_claim_poll() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j vg_private.send_jobs; batch text; token uuid;
BEGIN
 SELECT q.* INTO j FROM vg_private.send_jobs q JOIN public.send_runs r ON r.id=q.run_id
 WHERE r.provider_batch_id IS NOT NULL AND q.next_poll<=now() AND(q.poll_until IS NULL OR q.poll_until<now())
 ORDER BY q.next_poll FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT provider_batch_id INTO batch FROM public.send_runs WHERE id=j.run_id;
 token=gen_random_uuid();UPDATE vg_private.send_jobs SET poll_token=token,poll_until=now()+interval '5 minutes',poll_count=poll_count+1 WHERE run_id=j.run_id;
 -- Periodic replay protects against imperfect provider cursors; dedup makes it safe.
 RETURN jsonb_build_object('run_id',j.run_id,'poll_token',token,'batch_id',batch,
 'cursor',CASE WHEN j.poll_count%10=0 THEN NULL ELSE j.cursor_value END);
END; $$;
CREATE FUNCTION public.worker_poll_failed(p_run uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE vg_private.send_jobs SET poll_until=NULL,next_poll=now()+interval '60 seconds' WHERE run_id=p_run AND poll_token=p_token;
 IF FOUND THEN UPDATE public.send_runs SET safe_message='Delivery reports are temporarily unavailable. Last-known counts are shown.' WHERE id=p_run; END IF;
END; $$;

CREATE FUNCTION public.worker_record_page(p_run uuid,p_token uuid,p_events jsonb,p_issues jsonb,p_cursor text,p_more boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.send_runs; e jsonb; s public.send_recipients; old vg_private.provider_events;
 typ text; eid text; at_time timestamptz; fingerprint text; bad boolean;
BEGIN
 PERFORM 1 FROM vg_private.send_jobs WHERE run_id=p_run AND poll_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale polling lease'; END IF;
 IF p_events IS NULL OR p_issues IS NULL OR p_more IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>1000 OR jsonb_typeof(p_issues)<>'array' THEN RAISE EXCEPTION 'Invalid event page'; END IF;
 SELECT * INTO r FROM public.send_runs WHERE id=p_run;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  bad=false;
  BEGIN
   eid=e->>'event_id';typ=e->>'event_type';at_time=(e->>'occurred_at')::timestamptz;
   SELECT * INTO s FROM public.send_recipients WHERE run_id=p_run AND id=(e->>'recipient_id')::uuid;
   IF NOT FOUND OR eid IS NULL OR length(eid) NOT BETWEEN 1 AND 200 OR at_time IS NULL OR typ IS NULL OR typ NOT IN('delivered','open','bounce','unsubscribe') THEN bad=true; END IF;
  EXCEPTION WHEN OTHERS THEN bad=true;
  END;
  IF NOT bad AND NOT EXISTS(SELECT 1 FROM public.send_receipts WHERE run_id=p_run AND recipient_id=s.id AND accepted) THEN bad=true; END IF;
  IF NOT bad THEN
   SELECT * INTO old FROM vg_private.provider_events WHERE run_id=p_run AND event_id=eid;
   IF FOUND THEN
    IF (old.recipient_id,old.event_type,old.occurred_at) IS DISTINCT FROM (s.id,typ,at_time) THEN bad=true; ELSE CONTINUE; END IF;
   END IF;
  END IF;
  IF bad THEN
   fingerprint=encode(extensions.digest(e::text,'sha256'),'hex');
   INSERT INTO vg_private.provider_issues(run_id,fingerprint,code,raw_event) VALUES(p_run,fingerprint,'INVALID_OR_CONFLICTING_EVENT',e) ON CONFLICT DO NOTHING;
   CONTINUE;
  END IF;
  INSERT INTO vg_private.provider_events VALUES(p_run,eid,s.id,typ,at_time);
  INSERT INTO public.engagement_events(brand_id,source,external_event_id,contact_id,campaign_id,event_type,channel,occurred_at)
  VALUES(r.brand_id,'provider',p_run::text||':'||eid,s.contact_id,r.campaign_id,typ,s.channel,at_time) ON CONFLICT DO NOTHING;
  IF typ IN('bounce','unsubscribe') THEN
   INSERT INTO public.contact_suppressions(brand_id,contact_id,channel,reason,occurred_at)
   SELECT r.brand_id,c.id,s.channel,typ,at_time FROM public.contacts c WHERE c.brand_id=r.brand_id
    AND(c.id=s.contact_id OR CASE WHEN s.channel='email' THEN c.email=s.destination ELSE c.phone=s.destination END)
   ON CONFLICT(brand_id,contact_id,channel,reason) DO UPDATE SET occurred_at=greatest(contact_suppressions.occurred_at,EXCLUDED.occurred_at);
  END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p_issues) LOOP
  fingerprint=encode(extensions.digest(e::text,'sha256'),'hex');
  INSERT INTO vg_private.provider_issues(run_id,fingerprint,code,raw_event) VALUES(p_run,fingerprint,'UNRECOGNIZED_EVENT',e) ON CONFLICT DO NOTHING;
 END LOOP;
 UPDATE public.send_runs SET
 delivered_count=(SELECT count(DISTINCT recipient_id) FROM vg_private.provider_events WHERE run_id=p_run AND event_type='delivered'),
 opened_count=(SELECT count(DISTINCT recipient_id) FROM vg_private.provider_events WHERE run_id=p_run AND event_type='open'),
 bounced_count=(SELECT count(DISTINCT recipient_id) FROM vg_private.provider_events WHERE run_id=p_run AND event_type='bounce'),
 unsubscribed_count=(SELECT count(DISTINCT recipient_id) FROM vg_private.provider_events WHERE run_id=p_run AND event_type='unsubscribe'),
 issue_count=(SELECT count(*) FROM vg_private.provider_issues WHERE run_id=p_run),last_synced_at=now(),
 safe_message=CASE WHEN EXISTS(SELECT 1 FROM vg_private.provider_issues WHERE run_id=p_run) THEN 'Some provider reports could not be reconciled. Counts may be incomplete.'
 WHEN rejected_count>0 THEN 'The provider rejected some approved recipients.' ELSE NULL END WHERE id=p_run;
 UPDATE vg_private.send_jobs SET cursor_value=p_cursor,
 poll_until=CASE WHEN p_more THEN now()+interval '5 minutes' ELSE NULL END,
 next_poll=CASE WHEN p_more THEN now() ELSE now()+interval '30 seconds' END WHERE run_id=p_run;
END; $$;

CREATE TABLE public.share_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),brand_id uuid NOT NULL REFERENCES public.brands(id),campaign_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked_at timestamptz,
 FOREIGN KEY(brand_id,campaign_id) REFERENCES public.campaigns(brand_id,id)
);
CREATE TABLE vg_private.share_secrets (
 share_id uuid PRIMARY KEY REFERENCES public.share_links(id),token_hash text NOT NULL UNIQUE,password_hash text NOT NULL,
 attempt_count integer NOT NULL DEFAULT 0,window_started timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.portal_create_share(p_campaign_id uuid,p_password text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b uuid; sid uuid; token text;
BEGIN
 b=vg_private.current_brand_id();IF b IS NULL OR NOT vg_private.is_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF p_password IS NULL OR octet_length(p_password) NOT BETWEEN 12 AND 72 THEN RAISE EXCEPTION 'Password must be 12–72 bytes'; END IF;
 PERFORM 1 FROM public.campaigns WHERE id=p_campaign_id AND brand_id=b;IF NOT FOUND THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 token=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.share_links(brand_id,campaign_id,expires_at) VALUES(b,p_campaign_id,now()+interval '30 days') RETURNING id INTO sid;
 INSERT INTO vg_private.share_secrets(share_id,token_hash,password_hash) VALUES(sid,encode(extensions.digest(token,'sha256'),'hex'),extensions.crypt(p_password,extensions.gen_salt('bf',10)));
 RETURN jsonb_build_object('id',sid,'token',token,'expires_in_days',30);
END; $$;
CREATE FUNCTION public.portal_revoke_share(p_share_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT vg_private.is_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 UPDATE public.share_links SET revoked_at=now() WHERE id=p_share_id AND brand_id=vg_private.current_brand_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Share unavailable'; END IF;
END; $$;

CREATE FUNCTION public.portal_unlock_share(p_token text,p_password text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret vg_private.share_secrets; link public.share_links; p public.campaigns; r public.send_runs; brand_name text;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_password IS NULL OR octet_length(p_password) NOT BETWEEN 12 AND 72 THEN RETURN NULL; END IF;
 SELECT * INTO secret FROM vg_private.share_secrets WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO link FROM public.share_links WHERE id=secret.share_id;
 IF link.revoked_at IS NOT NULL OR link.expires_at<now() THEN RETURN NULL; END IF;
 IF secret.window_started<now()-interval '15 minutes' THEN secret.attempt_count=0;secret.window_started=now();END IF;
 IF secret.attempt_count>=20 THEN RETURN NULL; END IF;
 -- Returning NULL (not raising) commits attempt accounting for direct API callers.
 UPDATE vg_private.share_secrets SET attempt_count=secret.attempt_count+1,window_started=secret.window_started WHERE share_id=secret.share_id;
 IF extensions.crypt(p_password,secret.password_hash)<>secret.password_hash THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.campaigns WHERE id=link.campaign_id AND brand_id=link.brand_id;
 SELECT name INTO brand_name FROM public.brands WHERE id=link.brand_id;
 SELECT * INTO r FROM public.send_runs WHERE campaign_id=link.campaign_id AND brand_id=link.brand_id AND approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 1;
 -- Explicit allowlist only. No ids, recipients, raw events, tokens or hashes.
 RETURN jsonb_build_object('campaign_name',p.name,'brand_name',brand_name,'channel',p.channel,'updated_at',now(),
 'reported',jsonb_build_object('sent',p.reported_sent,'delivered',p.reported_delivered,'bounced',p.reported_bounced,'opens',p.reported_opens,'clicks',p.reported_clicks),
 'portal_send',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('status',r.status,'approved',r.recipient_count,'accepted',r.accepted_count,'rejected',r.rejected_count,'delivered',r.delivered_count,'opened',r.opened_count,'bounced',r.bounced_count,'unsubscribed',r.unsubscribed_count,'needs_review',r.issue_count>0,'last_synced_at',r.last_synced_at) END);
END; $$;

CREATE FUNCTION public.portal_send_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('approved',coalesce(sum(recipient_count),0),'accepted',coalesce(sum(accepted_count),0),
 'delivered',coalesce(sum(delivered_count),0),'opened',coalesce(sum(opened_count),0),
 'bounced',coalesce(sum(bounced_count),0),'unsubscribed',coalesce(sum(unsubscribed_count),0),
 'issues',coalesce(sum(issue_count),0),'last_sync',max(last_synced_at))
 FROM public.send_runs WHERE brand_id=vg_private.current_brand_id() AND approved_at IS NOT NULL AND status<>'blocked';
$$;

DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['send_runs','send_recipients','send_receipts','share_links'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(brand_id=(SELECT vg_private.current_brand_id()))',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('portal_send_summary','portal_prepare_send','portal_cancel_preview','portal_confirm_send','portal_create_share','portal_revoke_share','portal_unlock_share','worker_claim_send','worker_dispatch_failed','worker_dispatch_complete','worker_claim_poll','worker_poll_failed','worker_record_page') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname LIKE 'worker_%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
  IF f.proname='portal_unlock_share' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon',f.signature);END IF;
 END LOOP;
END; $$;
REVOKE ALL ON ALL TABLES IN SCHEMA vg_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION vg_private.freeze_approval(),vg_private.freeze_recipients(),vg_private.eligible_destinations(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
