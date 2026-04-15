-- Customer Care module: warranty/defect jobs received from housebuilder clients
-- (Persimmon, Wain Homes, Gilbert & Goode via Clixifix, Coastline via EBC Partnerships).
-- Jobs arrive as PDFs, are extracted to structured data, and tracked through completion.

CREATE TABLE customer_care_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid REFERENCES developers(id) ON DELETE SET NULL,
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  unit_reference text,
  address text,
  house_type text,
  homeowner_name text,
  homeowner_phone text,
  homeowner_email text,
  contact_notes text,
  external_ref text,
  source_format text,
  date_received date,
  sla_date date,
  priority text,
  status text NOT NULL DEFAULT 'new',
  raised_by text,
  assigned_decorator_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  appointment_date date,
  date_completed date,
  notes text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_care_jobs_developer_id_idx ON customer_care_jobs(developer_id);
CREATE INDEX customer_care_jobs_site_id_idx ON customer_care_jobs(site_id);
CREATE INDEX customer_care_jobs_status_idx ON customer_care_jobs(status);
CREATE INDEX customer_care_jobs_sla_date_idx ON customer_care_jobs(sla_date);

CREATE TABLE customer_care_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES customer_care_jobs(id) ON DELETE CASCADE,
  location text,
  category text,
  description text,
  issue_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_care_defects_job_id_idx ON customer_care_defects(job_id);

ALTER TABLE customer_care_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_care_defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all customer care jobs"
  ON customer_care_jobs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert customer care jobs"
  ON customer_care_jobs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update customer care jobs"
  ON customer_care_jobs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete customer care jobs"
  ON customer_care_jobs FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Decorators can view all customer care jobs"
  ON customer_care_jobs FOR SELECT
  USING (has_role(auth.uid(), 'decorator'::app_role));

CREATE POLICY "Admins can view all customer care defects"
  ON customer_care_defects FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert customer care defects"
  ON customer_care_defects FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update customer care defects"
  ON customer_care_defects FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete customer care defects"
  ON customer_care_defects FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Decorators can view all customer care defects"
  ON customer_care_defects FOR SELECT
  USING (has_role(auth.uid(), 'decorator'::app_role));
