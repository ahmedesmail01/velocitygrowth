-- Run as administrator in Supabase SQL Editor AFTER the importer succeeds.
-- This administrator report intentionally spans all three brands.
SELECT b.code,r.filename,r.status,r.total_rows,r.accepted_rows,r.rejected_rows,
 r.duplicate_rows,r.warning_rows,
 r.total_rows=r.accepted_rows+r.rejected_rows+r.duplicate_rows AS counts_reconcile,
 r.safe_error
FROM public.import_runs r JOIN public.brands b ON b.id=r.brand_id
ORDER BY b.code,r.created_at;

SELECT b.code,count(c.id) AS stored_contacts,
 count(c.id) FILTER (WHERE c.deleted_at IS NULL) AS customers,
 count(c.id) FILTER (WHERE c.email_contactable) AS email_contactable,
 count(c.id) FILTER (WHERE c.sms_contactable) AS sms_contactable,
 count(c.id) FILTER (WHERE c.email_contactable OR c.sms_contactable) AS contactable_either_channel
FROM public.brands b LEFT JOIN public.contact_eligibility c ON c.brand_id=b.id
GROUP BY b.code ORDER BY b.code;

SELECT b.code,i.severity,i.code,count(*) AS issues
FROM public.import_issues i JOIN public.brands b ON b.id=i.brand_id
GROUP BY b.code,i.severity,i.code ORDER BY b.code,issues DESC;
