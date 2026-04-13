-- Allow admin users to read all submissions across all users.
-- Required for the Dashboard activity feed to show all submissions.
-- Matches the existing pattern: profiles table has "Admins can view all profiles".

CREATE POLICY "Admins can view all sign-offs"
  ON sign_offs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all hourly agreements"
  ON hourly_agreements FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all invoices"
  ON invoices FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
