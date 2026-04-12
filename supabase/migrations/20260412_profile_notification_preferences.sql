ALTER TABLE profiles
  ADD COLUMN notify_issue_report     boolean NOT NULL DEFAULT false,
  ADD COLUMN notify_hourly_agreement boolean NOT NULL DEFAULT false,
  ADD COLUMN notify_sign_off         boolean NOT NULL DEFAULT false,
  ADD COLUMN notify_quality_report   boolean NOT NULL DEFAULT false,
  ADD COLUMN notify_invoice          boolean NOT NULL DEFAULT false;
