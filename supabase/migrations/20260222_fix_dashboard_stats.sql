-- Ensure dashboard stats can rely on linkedin_invitations timestamps across environments.
-- Safe/idempotent: no destructive changes.

do $$
declare
  has_table boolean;
  has_client_id boolean;
  has_status boolean;
  has_created_at boolean;
begin
  select to_regclass('public.linkedin_invitations') is not null
  into has_table;

  if not has_table then
    raise notice 'public.linkedin_invitations is missing, skipping migration.';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'linkedin_invitations'
      and column_name = 'client_id'
  )
  into has_client_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'linkedin_invitations'
      and column_name = 'status'
  )
  into has_status;

  if not has_client_id or not has_status then
    raise notice 'public.linkedin_invitations missing required columns (client_id/status), skipping.';
    return;
  end if;

  alter table public.linkedin_invitations
    add column if not exists sent_at timestamptz,
    add column if not exists accepted_at timestamptz;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'linkedin_invitations'
      and column_name = 'created_at'
  )
  into has_created_at;

  if has_created_at then
    update public.linkedin_invitations
    set sent_at = created_at
    where sent_at is null
      and created_at is not null
      and status in ('pending', 'sent', 'accepted', 'connected');

    update public.linkedin_invitations
    set accepted_at = created_at
    where accepted_at is null
      and created_at is not null
      and status in ('accepted', 'connected');
  end if;

  create index if not exists linkedin_invitations_client_status_idx
    on public.linkedin_invitations (client_id, status);

  create index if not exists linkedin_invitations_client_sent_at_idx
    on public.linkedin_invitations (client_id, sent_at desc);

  create index if not exists linkedin_invitations_client_accepted_at_idx
    on public.linkedin_invitations (client_id, accepted_at desc);
end $$;
