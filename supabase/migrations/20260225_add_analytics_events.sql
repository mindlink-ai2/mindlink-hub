create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id int not null,
  user_id text,
  session_id text not null,
  event_name text not null,
  event_category text,
  page_path text,
  referrer text,
  element jsonb,
  metadata jsonb,
  duration_ms int,
  device jsonb,
  ip_hash text
);

create index if not exists analytics_events_client_created_at_idx
  on public.analytics_events (client_id, created_at desc);

create index if not exists analytics_events_event_name_created_at_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_metadata_gin_idx
  on public.analytics_events using gin (metadata);

create index if not exists analytics_events_element_gin_idx
  on public.analytics_events using gin (element);

alter table public.analytics_events enable row level security;
alter table public.analytics_events force row level security;

revoke all on table public.analytics_events from anon;
revoke all on table public.analytics_events from authenticated;
grant all on table public.analytics_events to service_role;

create or replace function public.admin_analytics_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_client_id int default null,
  p_event_name text default null,
  p_event_category text default null,
  p_page_path text default null
)
returns table (
  sessions bigint,
  active_users bigint,
  page_views bigint,
  clicks bigint,
  top_feature text,
  top_feature_count bigint,
  errors bigint,
  total_events bigint,
  avg_events_per_session numeric,
  avg_page_views_per_session numeric,
  median_time_on_page_ms numeric
)
language sql
security definer
set search_path = public
as $$
with filtered as (
  select *
  from public.analytics_events e
  where e.created_at >= p_from
    and e.created_at <= p_to
    and (p_client_id is null or e.client_id = p_client_id)
    and (p_event_name is null or e.event_name = p_event_name)
    and (p_event_category is null or e.event_category = p_event_category)
    and (p_page_path is null or e.page_path = p_page_path)
),
feature_rank as (
  select
    e.metadata->>'feature' as feature_name,
    count(*)::bigint as feature_count
  from filtered e
  where e.event_name = 'feature_used'
    and coalesce(e.metadata->>'feature', '') <> ''
  group by e.metadata->>'feature'
  order by feature_count desc, feature_name asc
  limit 1
),
base_counts as (
  select
    count(*)::bigint as total_events_count,
    count(distinct e.session_id)::bigint as sessions_count,
    count(distinct e.user_id)::bigint as users_count,
    count(*) filter (where e.event_name = 'page_view')::bigint as page_views_count,
    count(*) filter (where e.event_name = 'click')::bigint as clicks_count,
    count(*) filter (where e.event_name in ('api_error', 'ui_error'))::bigint as errors_count
  from filtered e
),
time_on_page as (
  select percentile_cont(0.5) within group (order by e.duration_ms) as median_duration
  from filtered e
  where e.event_name = 'time_on_page'
    and e.duration_ms is not null
    and e.duration_ms >= 0
)
select
  b.sessions_count as sessions,
  b.users_count as active_users,
  b.page_views_count as page_views,
  b.clicks_count as clicks,
  coalesce(fr.feature_name, '') as top_feature,
  coalesce(fr.feature_count, 0)::bigint as top_feature_count,
  b.errors_count as errors,
  b.total_events_count as total_events,
  case
    when b.sessions_count = 0 then 0
    else round((b.total_events_count::numeric / b.sessions_count::numeric), 2)
  end as avg_events_per_session,
  case
    when b.sessions_count = 0 then 0
    else round((b.page_views_count::numeric / b.sessions_count::numeric), 2)
  end as avg_page_views_per_session,
  coalesce(t.median_duration, 0)::numeric as median_time_on_page_ms
from base_counts b
left join feature_rank fr on true
left join time_on_page t on true;
$$;

create or replace function public.admin_analytics_top_event_names(
  p_from timestamptz,
  p_to timestamptz,
  p_client_id int default null,
  p_event_name text default null,
  p_event_category text default null,
  p_page_path text default null,
  p_limit int default 10
)
returns table (
  event_name text,
  total bigint
)
language sql
security definer
set search_path = public
as $$
with filtered as (
  select *
  from public.analytics_events e
  where e.created_at >= p_from
    and e.created_at <= p_to
    and (p_client_id is null or e.client_id = p_client_id)
    and (p_event_name is null or e.event_name = p_event_name)
    and (p_event_category is null or e.event_category = p_event_category)
    and (p_page_path is null or e.page_path = p_page_path)
)
select
  e.event_name,
  count(*)::bigint as total
from filtered e
group by e.event_name
order by total desc, e.event_name asc
limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

create or replace function public.admin_analytics_top_features(
  p_from timestamptz,
  p_to timestamptz,
  p_client_id int default null,
  p_limit int default 10
)
returns table (
  feature text,
  total bigint
)
language sql
security definer
set search_path = public
as $$
select
  e.metadata->>'feature' as feature,
  count(*)::bigint as total
from public.analytics_events e
where e.created_at >= p_from
  and e.created_at <= p_to
  and (p_client_id is null or e.client_id = p_client_id)
  and e.event_name = 'feature_used'
  and coalesce(e.metadata->>'feature', '') <> ''
group by e.metadata->>'feature'
order by total desc, feature asc
limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

create or replace function public.admin_analytics_top_pages(
  p_from timestamptz,
  p_to timestamptz,
  p_client_id int default null,
  p_limit int default 10
)
returns table (
  page_path text,
  total bigint
)
language sql
security definer
set search_path = public
as $$
select
  e.page_path,
  count(*)::bigint as total
from public.analytics_events e
where e.created_at >= p_from
  and e.created_at <= p_to
  and (p_client_id is null or e.client_id = p_client_id)
  and coalesce(e.page_path, '') <> ''
group by e.page_path
order by total desc, e.page_path asc
limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

create or replace function public.admin_analytics_top_elements(
  p_from timestamptz,
  p_to timestamptz,
  p_client_id int default null,
  p_limit int default 10
)
returns table (
  element_label text,
  element_type text,
  element_id text,
  href text,
  total bigint
)
language sql
security definer
set search_path = public
as $$
select
  coalesce(
    nullif(e.element->>'id', ''),
    nullif(e.element->>'text', ''),
    nullif(e.element->>'href', ''),
    'unknown'
  ) as element_label,
  nullif(e.element->>'type', '') as element_type,
  nullif(e.element->>'id', '') as element_id,
  nullif(e.element->>'href', '') as href,
  count(*)::bigint as total
from public.analytics_events e
where e.created_at >= p_from
  and e.created_at <= p_to
  and (p_client_id is null or e.client_id = p_client_id)
  and e.event_name = 'click'
  and e.element is not null
group by 1, 2, 3, 4
order by total desc, element_label asc
limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

create or replace function public.admin_analytics_funnel(
  p_from timestamptz,
  p_to timestamptz,
  p_client_id int default null
)
returns table (
  step text,
  sessions bigint,
  conversion_rate numeric
)
language sql
security definer
set search_path = public
as $$
with filtered as (
  select *
  from public.analytics_events e
  where e.created_at >= p_from
    and e.created_at <= p_to
    and (p_client_id is null or e.client_id = p_client_id)
),
steps as (
  select
    count(distinct e.session_id)::bigint filter (
      where e.event_name = 'page_view'
        and e.page_path like '/onboarding%'
    ) as step_1,
    count(distinct e.session_id)::bigint filter (
      where e.event_name = 'form_submit'
        and (
          coalesce(e.metadata->>'form', '') in ('onboarding', 'onboarding_form')
          or coalesce(e.page_path, '') like '/onboarding%'
        )
    ) as step_2,
    count(distinct e.session_id)::bigint filter (
      where e.event_name = 'feature_used'
        and coalesce(e.metadata->>'feature', '') in (
          'first_action',
          'send_linkedin_message',
          'open_inbox',
          'create_leads_export'
        )
    ) as step_3
  from filtered e
)
select
  'page_view_onboarding'::text as step,
  s.step_1 as sessions,
  100::numeric as conversion_rate
from steps s
union all
select
  'form_submit_onboarding'::text as step,
  s.step_2 as sessions,
  case when s.step_1 = 0 then 0 else round((s.step_2::numeric / s.step_1::numeric) * 100, 2) end
from steps s
union all
select
  'first_feature_used'::text as step,
  s.step_3 as sessions,
  case when s.step_1 = 0 then 0 else round((s.step_3::numeric / s.step_1::numeric) * 100, 2) end
from steps s;
$$;

create or replace function public.admin_analytics_clients(
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 200
)
returns table (
  client_id int,
  total_events bigint
)
language sql
security definer
set search_path = public
as $$
select
  e.client_id,
  count(*)::bigint as total_events
from public.analytics_events e
where e.created_at >= p_from
  and e.created_at <= p_to
group by e.client_id
order by total_events desc, e.client_id asc
limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.admin_analytics_summary(timestamptz, timestamptz, int, text, text, text) from public;
revoke all on function public.admin_analytics_top_event_names(timestamptz, timestamptz, int, text, text, text, int) from public;
revoke all on function public.admin_analytics_top_features(timestamptz, timestamptz, int, int) from public;
revoke all on function public.admin_analytics_top_pages(timestamptz, timestamptz, int, int) from public;
revoke all on function public.admin_analytics_top_elements(timestamptz, timestamptz, int, int) from public;
revoke all on function public.admin_analytics_funnel(timestamptz, timestamptz, int) from public;
revoke all on function public.admin_analytics_clients(timestamptz, timestamptz, int) from public;

grant execute on function public.admin_analytics_summary(timestamptz, timestamptz, int, text, text, text) to service_role;
grant execute on function public.admin_analytics_top_event_names(timestamptz, timestamptz, int, text, text, text, int) to service_role;
grant execute on function public.admin_analytics_top_features(timestamptz, timestamptz, int, int) to service_role;
grant execute on function public.admin_analytics_top_pages(timestamptz, timestamptz, int, int) to service_role;
grant execute on function public.admin_analytics_top_elements(timestamptz, timestamptz, int, int) to service_role;
grant execute on function public.admin_analytics_funnel(timestamptz, timestamptz, int) to service_role;
grant execute on function public.admin_analytics_clients(timestamptz, timestamptz, int) to service_role;
