-- Full plan + LinkedIn automation foundations (Supabase)

create extension if not exists pgcrypto;

-- A) clients.plan normalization / constraint
alter table public.clients
  alter column plan type text using lower(btrim(coalesce(plan, '')));

update public.clients
set plan = 'essential'
where plan is null
   or btrim(plan) = ''
   or plan not in ('essential', 'full');

alter table public.clients
  alter column plan set default 'essential';

alter table public.clients
  alter column plan set not null;

alter table public.clients
  drop constraint if exists clients_plan_check;

alter table public.clients
  add constraint clients_plan_check
  check (plan in ('essential', 'full'));

-- B) Settings table for FULL automation
create table if not exists public.client_linkedin_settings (
  client_id bigint primary key references public.clients(id) on delete cascade,
  enabled boolean not null default false,
  daily_invite_quota integer not null default 10,
  timezone text not null default 'Europe/Paris',
  start_time time not null default '08:00',
  end_time time not null default '18:00',
  unipile_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_linkedin_settings_daily_quota_check
    check (daily_invite_quota in (10, 20, 30))
);

create index if not exists client_linkedin_settings_enabled_idx
  on public.client_linkedin_settings (enabled);

create index if not exists client_linkedin_settings_unipile_account_id_idx
  on public.client_linkedin_settings (unipile_account_id);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_client_linkedin_settings_updated_at on public.client_linkedin_settings;
create trigger trg_client_linkedin_settings_updated_at
before update on public.client_linkedin_settings
for each row execute function public.set_row_updated_at();

-- C) linkedin_invitations extension + uniqueness
alter table public.linkedin_invitations
  add column if not exists dm_draft_text text;

alter table public.linkedin_invitations
  add column if not exists dm_draft_status text;

alter table public.linkedin_invitations
  add column if not exists dm_sent_at timestamptz;

alter table public.linkedin_invitations
  add column if not exists last_error text;

update public.linkedin_invitations
set dm_draft_status = 'none'
where dm_draft_status is null or btrim(dm_draft_status) = '';

alter table public.linkedin_invitations
  alter column dm_draft_status set default 'none';

alter table public.linkedin_invitations
  alter column dm_draft_status set not null;

alter table public.linkedin_invitations
  drop constraint if exists linkedin_invitations_dm_draft_status_check;

alter table public.linkedin_invitations
  add constraint linkedin_invitations_dm_draft_status_check
  check (dm_draft_status in ('none', 'draft', 'sent'));

with ranked as (
  select
    ctid,
    row_number() over (
      partition by client_id, lead_id, unipile_account_id
      order by coalesce(accepted_at, sent_at, now()) desc, id desc
    ) as rn
  from public.linkedin_invitations
  where lead_id is not null
    and unipile_account_id is not null
)
delete from public.linkedin_invitations t
using ranked r
where t.ctid = r.ctid
  and r.rn > 1;

create unique index if not exists linkedin_invitations_client_lead_account_uidx
  on public.linkedin_invitations (client_id, lead_id, unipile_account_id);

-- D) Automation logs table
create table if not exists public.automation_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  client_id bigint not null references public.clients(id) on delete cascade,
  runner text not null default 'linkedin-cron-runner',
  action text not null,
  status text not null default 'info',
  lead_id bigint,
  unipile_account_id text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists automation_logs_client_created_idx
  on public.automation_logs (client_id, created_at desc);

create index if not exists automation_logs_runner_status_idx
  on public.automation_logs (runner, status, created_at desc);

-- Advisory-lock helpers for cron idempotence
create or replace function public.try_acquire_linkedin_cron_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(922337203685477000::bigint);
$$;

create or replace function public.release_linkedin_cron_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(922337203685477000::bigint);
$$;

grant execute on function public.try_acquire_linkedin_cron_lock() to service_role;
grant execute on function public.release_linkedin_cron_lock() to service_role;

-- RLS policies (client-scoped)
alter table public.client_linkedin_settings enable row level security;
alter table public.automation_logs enable row level security;

drop policy if exists client_linkedin_settings_select_own on public.client_linkedin_settings;
create policy client_linkedin_settings_select_own
on public.client_linkedin_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_linkedin_settings.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

drop policy if exists client_linkedin_settings_insert_own on public.client_linkedin_settings;
create policy client_linkedin_settings_insert_own
on public.client_linkedin_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_linkedin_settings.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

drop policy if exists client_linkedin_settings_update_own on public.client_linkedin_settings;
create policy client_linkedin_settings_update_own
on public.client_linkedin_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_linkedin_settings.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_linkedin_settings.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

drop policy if exists automation_logs_select_own on public.automation_logs;
create policy automation_logs_select_own
on public.automation_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = automation_logs.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

-- Ensure Realtime has the settings table if needed by the Hub UI.
do $$
begin
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'client_linkedin_settings'
    ) then
      alter publication supabase_realtime add table public.client_linkedin_settings;
    end if;
  exception
    when undefined_object then
      null;
  end;
end
$$;
