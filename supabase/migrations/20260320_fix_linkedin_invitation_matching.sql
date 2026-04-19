alter table public.linkedin_invitations
  add column if not exists target_linkedin_provider_id text;

alter table public.linkedin_invitations
  add column if not exists target_profile_slug text;

alter table public.linkedin_invitations
  add column if not exists target_linkedin_url_normalized text;

alter table public.linkedin_invitations
  add column if not exists unipile_invitation_id text;

update public.linkedin_invitations
set target_linkedin_provider_id = coalesce(
  nullif(btrim(target_linkedin_provider_id), ''),
  nullif(btrim(raw ->> 'target_linkedin_provider_id'), ''),
  nullif(btrim(raw ->> 'provider_id'), ''),
  nullif(btrim(raw -> 'invite_response' ->> 'provider_id'), ''),
  nullif(btrim(raw -> 'invitation' ->> 'target_linkedin_provider_id'), ''),
  nullif(btrim(raw -> 'invitation' ->> 'provider_id'), ''),
  nullif(btrim(raw -> 'invitation' -> 'invite_response' ->> 'provider_id'), '')
)
where coalesce(btrim(target_linkedin_provider_id), '') = '';

update public.linkedin_invitations
set unipile_invitation_id = coalesce(
  nullif(btrim(unipile_invitation_id), ''),
  nullif(btrim(raw ->> 'unipile_invitation_id'), ''),
  nullif(btrim(raw ->> 'invitation_id'), ''),
  nullif(btrim(raw -> 'invite_response' ->> 'invitation_id'), ''),
  nullif(btrim(raw -> 'invitation' ->> 'unipile_invitation_id'), ''),
  nullif(btrim(raw -> 'invitation' ->> 'invitation_id'), ''),
  nullif(btrim(raw -> 'invitation' -> 'invite_response' ->> 'invitation_id'), '')
)
where coalesce(btrim(unipile_invitation_id), '') = '';

do $$
declare
  lead_url_expr text := 'null';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'LinkedInURL'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'linkedin_url'
  ) then
    lead_url_expr := 'coalesce(l."LinkedInURL", l.linkedin_url)';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'LinkedInURL'
  ) then
    lead_url_expr := 'l."LinkedInURL"';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'linkedin_url'
  ) then
    lead_url_expr := 'l.linkedin_url';
  end if;

  execute format(
    $sql$
      update public.linkedin_invitations li
      set
        target_profile_slug = coalesce(
          nullif(btrim(li.target_profile_slug), ''),
          nullif(lower(btrim(li.raw ->> 'target_profile_slug')), ''),
          nullif(lower(btrim(li.raw ->> 'profile_slug')), ''),
          nullif(lower(btrim(li.raw -> 'matching' ->> 'profile_slug')), ''),
          nullif(lower(btrim(li.raw -> 'acceptance' -> 'matching' ->> 'profile_slug')), ''),
          nullif(lower(btrim(li.raw -> 'invitation' ->> 'target_profile_slug')), ''),
          nullif(lower(btrim(li.raw -> 'invitation' ->> 'profile_slug')), ''),
          nullif(lower((regexp_match(%1$s, 'linkedin\\.com/(?:in|pub)/([^/?#]+)', 'i'))[1]), '')
        ),
        target_linkedin_url_normalized = coalesce(
          nullif(btrim(li.target_linkedin_url_normalized), ''),
          nullif(lower(btrim(li.raw ->> 'target_linkedin_url_normalized')), ''),
          nullif(lower(btrim(li.raw ->> 'normalized_linkedin_url')), ''),
          nullif(lower(btrim(li.raw -> 'matching' ->> 'normalized_linkedin_url')), ''),
          nullif(lower(btrim(li.raw -> 'acceptance' -> 'matching' ->> 'normalized_linkedin_url')), ''),
          nullif(lower(btrim(li.raw -> 'invitation' ->> 'target_linkedin_url_normalized')), ''),
          nullif(lower(btrim(li.raw -> 'invitation' ->> 'normalized_linkedin_url')), '')
        )
      from public.leads l
      where l.id = li.lead_id
        and l.client_id = li.client_id
        and (
          coalesce(btrim(li.target_profile_slug), '') = ''
          or coalesce(btrim(li.target_linkedin_url_normalized), '') = ''
        );
    $sql$,
    lead_url_expr
  );
end
$$;

do $$
declare
  dedupe_order_expr text := 'coalesce(accepted_at, sent_at, now()) desc, id desc';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'linkedin_invitations'
      and column_name = 'created_at'
  ) then
    dedupe_order_expr := 'coalesce(accepted_at, sent_at, created_at, now()) desc, id desc';
  end if;

  execute format(
    $sql$
      with duplicated_invitation_ids as (
        select
          id,
          row_number() over (
            partition by client_id, unipile_account_id, unipile_invitation_id
            order by %1$s
          ) as rn
        from public.linkedin_invitations
        where unipile_invitation_id is not null
          and btrim(unipile_invitation_id) <> ''
      )
      update public.linkedin_invitations li
      set unipile_invitation_id = null
      from duplicated_invitation_ids d
      where li.id = d.id
        and d.rn > 1;
    $sql$,
    dedupe_order_expr
  );
end
$$;

update public.linkedin_invitations
set
  status = 'sent',
  accepted_at = null,
  dm_draft_status = case
    when coalesce(btrim(dm_draft_text), '') = '' then 'none'
    else 'draft'
  end,
  dm_sent_at = null,
  last_error = 'acceptance_match_ambiguous'
where status = 'accepted'
  and (
    lower(coalesce(last_error, '')) = 'send_manually'
    or coalesce(raw -> 'acceptance' -> 'matching' ->> 'strategy', '') = 'fallback_last_sent'
  );

create index if not exists linkedin_invitations_client_account_target_provider_idx
  on public.linkedin_invitations (client_id, unipile_account_id, target_linkedin_provider_id)
  where target_linkedin_provider_id is not null;

create index if not exists linkedin_invitations_client_account_target_slug_idx
  on public.linkedin_invitations (client_id, unipile_account_id, target_profile_slug)
  where target_profile_slug is not null;

create index if not exists linkedin_invitations_client_account_target_url_idx
  on public.linkedin_invitations (client_id, unipile_account_id, target_linkedin_url_normalized)
  where target_linkedin_url_normalized is not null;

create unique index if not exists linkedin_invitations_client_account_unipile_invitation_uidx
  on public.linkedin_invitations (client_id, unipile_account_id, unipile_invitation_id)
  where unipile_invitation_id is not null;
