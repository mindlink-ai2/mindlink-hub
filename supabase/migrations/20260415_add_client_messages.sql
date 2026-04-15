-- Migration: Chat messages setup (onboarding step 3)
-- 1) Extends client_onboarding_state with icp_submitted state
-- 2) Creates client_messages table (one row per client, upserted)

-- ============================================================
-- 1. Extend client_onboarding_state.state enum
-- ============================================================
alter table public.client_onboarding_state
  drop constraint if exists client_onboarding_state_state_check;

alter table public.client_onboarding_state
  add constraint client_onboarding_state_state_check
  check (state in ('created', 'linkedin_connected', 'icp_submitted', 'completed'));

alter table public.client_onboarding_state
  add column if not exists icp_submitted_at timestamptz;

-- ============================================================
-- 2. client_messages — prospection messages validated by client
-- ============================================================
create table if not exists public.client_messages (
  id uuid default gen_random_uuid() primary key,
  org_id bigint not null references public.clients(id) on delete cascade,
  message_linkedin text not null default '',
  relance_linkedin text not null default '',
  message_email text not null default '',
  system_prompt text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'active')),
  conversation_history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists client_messages_org_id_unique
  on public.client_messages(org_id);

create index if not exists client_messages_org_id_idx
  on public.client_messages(org_id);

-- ============================================================
-- 3. RLS — client sees only its own row; service role bypasses
-- ============================================================
alter table public.client_messages enable row level security;

drop policy if exists client_messages_client_select on public.client_messages;
create policy client_messages_client_select on public.client_messages
  for select
  using (
    org_id in (
      select id from public.clients where clerk_user_id = auth.uid()::text
    )
  );

drop policy if exists client_messages_client_insert on public.client_messages;
create policy client_messages_client_insert on public.client_messages
  for insert
  with check (
    org_id in (
      select id from public.clients where clerk_user_id = auth.uid()::text
    )
  );

drop policy if exists client_messages_client_update on public.client_messages;
create policy client_messages_client_update on public.client_messages
  for update
  using (
    org_id in (
      select id from public.clients where clerk_user_id = auth.uid()::text
    )
  );
