-- Support widget storage for Hub Lidmeo
-- Note: this migration does not alter existing support page routes/tables.

create extension if not exists pgcrypto;

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_email text,
  user_name text,
  status text not null default 'open',
  last_message_at timestamptz not null default now(),
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_conversations_user_id_uidx
  on public.support_conversations (user_id);

create index if not exists support_conversations_last_message_at_idx
  on public.support_conversations (last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'support')),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at desc);

create index if not exists support_messages_created_at_idx
  on public.support_messages (created_at desc);

create or replace function public.support_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_support_conversations_updated_at on public.support_conversations;
create trigger trg_support_conversations_updated_at
before update on public.support_conversations
for each row execute function public.support_set_updated_at();

create or replace function public.support_sync_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.support_conversations
  set
    last_message_at = coalesce(new.created_at, now()),
    unread_count = case
      when new.sender_type = 'support' and new.read_at is null
        then coalesce(unread_count, 0) + 1
      else coalesce(unread_count, 0)
    end,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists trg_support_messages_sync_conversation on public.support_messages;
create trigger trg_support_messages_sync_conversation
after insert on public.support_messages
for each row execute function public.support_sync_conversation_on_message();

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists support_conversations_select_own on public.support_conversations;
create policy support_conversations_select_own
on public.support_conversations
for select
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', ''));

drop policy if exists support_conversations_insert_own on public.support_conversations;
create policy support_conversations_insert_own
on public.support_conversations
for insert
to authenticated
with check (user_id = coalesce(auth.jwt() ->> 'sub', ''));

drop policy if exists support_conversations_update_own on public.support_conversations;
create policy support_conversations_update_own
on public.support_conversations
for update
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', ''))
with check (user_id = coalesce(auth.jwt() ->> 'sub', ''));

drop policy if exists support_messages_select_own on public.support_messages;
create policy support_messages_select_own
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_conversations c
    where c.id = support_messages.conversation_id
      and c.user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

drop policy if exists support_messages_insert_user on public.support_messages;
create policy support_messages_insert_user
on public.support_messages
for insert
to authenticated
with check (
  sender_type = 'user'
  and exists (
    select 1
    from public.support_conversations c
    where c.id = support_messages.conversation_id
      and c.user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

drop policy if exists support_messages_update_read_own on public.support_messages;
create policy support_messages_update_read_own
on public.support_messages
for update
to authenticated
using (
  sender_type = 'support'
  and exists (
    select 1
    from public.support_conversations c
    where c.id = support_messages.conversation_id
      and c.user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
)
with check (
  sender_type = 'support'
  and exists (
    select 1
    from public.support_conversations c
    where c.id = support_messages.conversation_id
      and c.user_id = coalesce(auth.jwt() ->> 'sub', '')
  )
);

-- Realtime subscriptions used by the floating widget.
do $$
begin
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'support_messages'
    ) then
      alter publication supabase_realtime add table public.support_messages;
    end if;
  exception
    when undefined_object then
      -- publication can be absent in local setups
      null;
  end;

  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'support_conversations'
    ) then
      alter publication supabase_realtime add table public.support_conversations;
    end if;
  exception
    when undefined_object then
      null;
  end;
end
$$;
