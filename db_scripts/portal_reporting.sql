-- Run once in Supabase SQL Editor after the successful step-02 import.
-- Safe to rerun. No contacts, imports, users or historical records are changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.portal_dashboard() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH brand AS (
  SELECT id,timezone FROM public.brands WHERE id=(SELECT vg_private.current_brand_id())
 ), bounds AS (
  SELECT id,timezone,(now() AT TIME ZONE timezone)::date AS today FROM brand
 ), totals AS (
  SELECT count(*) FILTER(WHERE deleted_at IS NULL) AS customers,
   count(*) FILTER(WHERE email_contactable OR sms_contactable) AS contactable,
   count(*) FILTER(WHERE email_contactable) AS email_contactable,
   count(*) FILTER(WHERE sms_contactable) AS sms_contactable
  FROM public.contact_eligibility WHERE brand_id=(SELECT id FROM brand)
 ), days AS (
  SELECT (b.today-i)::date AS day FROM bounds b CROSS JOIN generate_series(0,29) i
 ), signups AS (
  SELECT (c.signup_at AT TIME ZONE b.timezone)::date AS day,count(*) AS n
  FROM public.contacts c JOIN bounds b ON c.brand_id=b.id
  WHERE c.deleted_at IS NULL
   AND c.signup_at>=((b.today-29)::timestamp AT TIME ZONE b.timezone)
   AND c.signup_at<((b.today+1)::timestamp AT TIME ZONE b.timezone)
  GROUP BY 1
 ), issues AS (
  SELECT count(*) FILTER(WHERE severity='error') AS errors,
   count(*) FILTER(WHERE severity='warning') AS warnings FROM public.import_issues
  WHERE brand_id=(SELECT id FROM brand)
 )
 SELECT CASE WHEN EXISTS(SELECT 1 FROM brand) THEN jsonb_build_object(
  'totals',(SELECT to_jsonb(t) FROM totals t),
  'timezone',(SELECT timezone FROM brand),
  'as_of',now(),
  'campaigns',(SELECT count(*) FROM public.campaigns WHERE brand_id=(SELECT id FROM brand)),
  'issues',(SELECT to_jsonb(i) FROM issues i),
  'signups',(SELECT jsonb_agg(jsonb_build_object('day',d.day,'count',coalesce(s.n,0)) ORDER BY d.day) FROM days d LEFT JOIN signups s USING(day))
 ) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.portal_dashboard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_dashboard() TO authenticated;

-- Unique openers/clickers count identities, while event totals count deduplicated
-- events. Keep these separate from unverified historical reported totals.
CREATE OR REPLACE FUNCTION public.portal_campaign_results(p_campaign_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH campaign AS (
  SELECT * FROM public.campaigns WHERE id=p_campaign_id
   AND brand_id=(SELECT vg_private.current_brand_id())
 ), events AS (
  SELECT e.* FROM public.engagement_events e JOIN campaign c
   ON c.brand_id=e.brand_id AND c.id=e.campaign_id
 ), aggregate AS (
  SELECT count(*) FILTER(WHERE event_type='open') AS open_events,
   count(DISTINCT contact_id) FILTER(WHERE event_type='open') AS unique_openers,
   count(*) FILTER(WHERE event_type='click') AS click_events,
   count(DISTINCT contact_id) FILTER(WHERE event_type='click') AS unique_clickers,
   count(DISTINCT contact_id) FILTER(WHERE event_type='bounce') AS bounced_contacts,
   count(DISTINCT contact_id) FILTER(WHERE event_type='unsubscribe') AS unsubscribed_contacts,
   count(DISTINCT contact_id) FILTER(WHERE event_type='complaint') AS complaint_contacts,
   count(*) FILTER(WHERE channel<>(SELECT channel FROM campaign)) AS different_channel_events
  FROM events
 ) SELECT CASE WHEN EXISTS(SELECT 1 FROM campaign) THEN jsonb_build_object(
  'campaign',(SELECT to_jsonb(c) FROM campaign c),
  'observed',(SELECT to_jsonb(a) FROM aggregate a)
 ) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.portal_campaign_results(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_campaign_results(uuid) TO authenticated;
COMMIT;
