alter table public.inbox_threads
add column if not exists last_read_at timestamptz;
