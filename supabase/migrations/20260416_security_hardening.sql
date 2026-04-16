-- Security hardening pass (safe changes only):
--   1. Pin search_path on all 17 flagged public functions to prevent
--      search-path injection (Supabase linter 0011).
--   2. Add security_invoker = on to activity_feed, plot_progress, site_summary
--      so they run with the querying user's permissions, not the view owner's
--      (Supabase linter 0010).

-- ---- 1. Functions ---------------------------------------------------------

ALTER FUNCTION public.bulk_upsert_plot_tasks(items jsonb) SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_hourly_agreement_reference() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_invoice_reference() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_issue_report_reference() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_plot_tasks_for_new_plot() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_quality_report_reference() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_sign_off_reference() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_dashboard_stats() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_developer_stats() SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_hourly_agreement_insert() SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_invoice_email_queue() SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_issue_report_insert() SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_quality_report_insert() SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_sign_off_insert() SET search_path = public, pg_catalog;
ALTER FUNCTION public.hard_delete_user(_user_id uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_contacts_updated_at() SET search_path = public, pg_catalog;

-- ---- 2. Views -------------------------------------------------------------

ALTER VIEW public.activity_feed SET (security_invoker = on);
ALTER VIEW public.plot_progress SET (security_invoker = on);
ALTER VIEW public.site_summary SET (security_invoker = on);
