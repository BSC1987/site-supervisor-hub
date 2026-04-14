-- Track the last time a user was active in the app.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- RPC callers update their own row via auth.uid().
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = now()
   where user_id = auth.uid();
$$;

grant execute on function public.touch_last_seen() to authenticated;
