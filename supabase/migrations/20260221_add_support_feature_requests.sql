-- Store feature requests sent from the support widget.

create extension if not exists pgcrypto;

create table if not exists public.support_feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_email text,
  user_name text,
  body text not null,
  status text not null default 'new' check (status in ('new', 'reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_feature_requests_created_at_idx
  on public.support_feature_requests (created_at desc);

create index if not exists support_feature_requests_status_created_idx
  on public.support_feature_requests (status, created_at desc);

create index if not exists support_feature_requests_user_id_created_idx
  on public.support_feature_requests (user_id, created_at desc);

create or replace function public.support_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_support_feature_requests_updated_at on public.support_feature_requests;
create trigger trg_support_feature_requests_updated_at
before update on public.support_feature_requests
for each row execute function public.support_set_updated_at();

alter table public.support_feature_requests enable row level security;

drop policy if exists support_feature_requests_select_own on public.support_feature_requests;
create policy support_feature_requests_select_own
on public.support_feature_requests
for select
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', ''));

drop policy if exists support_feature_requests_insert_own on public.support_feature_requests;
create policy support_feature_requests_insert_own
on public.support_feature_requests
for insert
to authenticated
with check (user_id = coalesce(auth.jwt() ->> 'sub', ''));

do $$
begin
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'support_feature_requests'
    ) then
      alter publication supabase_realtime add table public.support_feature_requests;
    end if;
  exception
    when undefined_object then
      null;
  end;
end
$$;
