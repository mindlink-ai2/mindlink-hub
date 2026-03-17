-- Fix: replace pg_advisory_lock (session-scoped, incompatible with PgBouncer)
-- with a table-based lock that auto-expires after 10 minutes.

create table if not exists public.cron_locks (
  name text primary key,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);

grant select, insert, update, delete on public.cron_locks to service_role;

create or replace function public.try_acquire_linkedin_cron_lock()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Expire stale locks first (in case a previous run crashed)
  delete from public.cron_locks
  where name = 'linkedin-cron-runner'
    and expires_at < now();

  -- Try to insert the lock row (fails silently on conflict = already locked)
  insert into public.cron_locks (name, acquired_at, expires_at)
  values ('linkedin-cron-runner', now(), now() + interval '10 minutes')
  on conflict do nothing;

  return found;
end;
$$;

create or replace function public.release_linkedin_cron_lock()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.cron_locks where name = 'linkedin-cron-runner';
  return found;
end;
$$;

grant execute on function public.try_acquire_linkedin_cron_lock() to service_role;
grant execute on function public.release_linkedin_cron_lock() to service_role;
