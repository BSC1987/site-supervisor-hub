-- Drop broad SELECT policies on storage.objects that allow file enumeration.
-- Buckets stay public (files remain accessible via /storage/v1/object/public/<bucket>/<path>),
-- but clients can no longer list/enumerate file contents.

DROP POLICY IF EXISTS "Allow hourly-agreement-photos public reads"     ON storage.objects;
DROP POLICY IF EXISTS "Allow hourly-agreement-signatures public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow invoice-documents public reads"           ON storage.objects;
DROP POLICY IF EXISTS "Allow issue-report-photos public reads"         ON storage.objects;
DROP POLICY IF EXISTS "Allow misc-item-photos public reads"            ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads"                             ON storage.objects;
DROP POLICY IF EXISTS "Allow quality-report-photos public reads"       ON storage.objects;
DROP POLICY IF EXISTS "Allow sign-off-signatures public reads"         ON storage.objects;
DROP POLICY IF EXISTS "Allow site-plans public reads"                  ON storage.objects;
