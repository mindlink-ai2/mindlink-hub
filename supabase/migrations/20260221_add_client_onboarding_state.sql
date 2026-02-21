-- Wizard onboarding state for newly linked clients.
-- Does not modify existing tables public.clients or public.unipile_accounts.

create table if not exists public.client_onboarding_state (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  state text not null default 'created' check (state in ('created', 'linkedin_connected', 'completed')),
  created_at timestamptz not null default now(),
  linkedin_connected_at timestamptz,
  completed_at timestamptz
);

create unique index if not exists client_onboarding_state_client_id_uidx
  on public.client_onboarding_state (client_id);

create index if not exists client_onboarding_state_client_id_idx
  on public.client_onboarding_state (client_id);

alter table public.client_onboarding_state enable row level security;

drop policy if exists client_onboarding_state_select_own on public.client_onboarding_state;
create policy client_onboarding_state_select_own
on public.client_onboarding_state
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_onboarding_state.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

drop policy if exists client_onboarding_state_update_own on public.client_onboarding_state;
create policy client_onboarding_state_update_own
on public.client_onboarding_state
for update
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_onboarding_state.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_onboarding_state.client_id
      and c.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);
