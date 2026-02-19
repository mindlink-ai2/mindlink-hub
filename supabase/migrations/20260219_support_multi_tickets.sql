-- Enable multiple support tickets per user + human-friendly ticket number

create sequence if not exists public.support_conversations_ticket_number_seq;

alter table public.support_conversations
add column if not exists ticket_number bigint;

alter table public.support_conversations
alter column ticket_number set default nextval('public.support_conversations_ticket_number_seq');

update public.support_conversations
set ticket_number = nextval('public.support_conversations_ticket_number_seq')
where ticket_number is null;

alter table public.support_conversations
alter column ticket_number set not null;

create unique index if not exists support_conversations_ticket_number_uidx
  on public.support_conversations (ticket_number);

-- One user can now have many tickets.
drop index if exists support_conversations_user_id_uidx;
