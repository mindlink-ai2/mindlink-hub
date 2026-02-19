alter table public.support_messages
add column if not exists read_by_support_at timestamptz;

create index if not exists support_messages_read_by_support_idx
  on public.support_messages (conversation_id, read_by_support_at)
  where sender_type = 'user';
