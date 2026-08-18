-- Preserve Austin facility IDs as immutable source identities while allowing
-- reviewed duplicate records to appear as one canonical establishment.

create table if not exists public.restaurant_duplicate_rules (
  duplicate_facility_id text primary key,
  canonical_facility_id text not null,
  reason text not null,
  reviewed_by text not null default 'manual',
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint restaurant_duplicate_rule_not_self check (duplicate_facility_id <> canonical_facility_id)
);

create index if not exists restaurant_duplicate_rules_canonical_idx
  on public.restaurant_duplicate_rules (canonical_facility_id);

alter table public.restaurant_duplicate_rules enable row level security;

drop policy if exists "Public duplicate rules are readable" on public.restaurant_duplicate_rules;
create policy "Public duplicate rules are readable"
  on public.restaurant_duplicate_rules for select using (true);

grant select on public.restaurant_duplicate_rules to anon, authenticated;

create or replace function public.validate_restaurant_duplicate_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.restaurant_duplicate_rules
    where duplicate_facility_id = new.canonical_facility_id
      and duplicate_facility_id <> new.duplicate_facility_id
  ) then
    raise exception 'Canonical facility % is already linked as a duplicate', new.canonical_facility_id;
  end if;

  if exists (
    select 1 from public.restaurant_duplicate_rules
    where canonical_facility_id = new.duplicate_facility_id
      and duplicate_facility_id <> new.duplicate_facility_id
  ) then
    raise exception 'Duplicate facility % is already the canonical facility for another rule', new.duplicate_facility_id;
  end if;

  return new;
end;
$$;

drop trigger if exists restaurant_duplicate_rules_validate on public.restaurant_duplicate_rules;
create trigger restaurant_duplicate_rules_validate
before insert or update on public.restaurant_duplicate_rules
for each row execute function public.validate_restaurant_duplicate_rule();

-- One-level membership view. Validation above prevents chains and cycles.
create or replace view public.restaurant_canonical_members with (security_invoker = true) as
select
  r.id as restaurant_id,
  r.facility_id,
  coalesce(rule.canonical_facility_id, r.facility_id) as canonical_facility_id
from public.restaurants r
left join public.restaurant_duplicate_rules rule
  on rule.duplicate_facility_id = r.facility_id;

grant select on public.restaurant_canonical_members to anon, authenticated;

-- Recalculate a canonical profile from all inspections belonging to the
-- canonical facility and its reviewed duplicate members.
create or replace function public.refresh_canonical_restaurant_profile(p_canonical_facility_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_total_count integer;
  v_recent_scores numeric[];
  v_recent_count integer;
  v_weights numeric[] := array[0.5, 0.3, 0.15, 0.05]::numeric[];
  v_weight_total numeric := 0;
  v_weighted_total numeric := 0;
  v_weighted_history numeric;
  v_standard_deviation numeric;
  v_consistency_adjustment numeric;
  v_trend_adjustment numeric;
  v_profile_score integer;
  v_index integer;
begin
  select id into v_restaurant_id
  from public.restaurants
  where facility_id = p_canonical_facility_id;

  if v_restaurant_id is null then
    return;
  end if;

  if exists (
    select 1 from public.restaurant_duplicate_rules
    where duplicate_facility_id = p_canonical_facility_id
  ) then
    raise exception 'Cannot refresh profile for duplicate facility %', p_canonical_facility_id;
  end if;

  select count(*)::integer into v_total_count
  from public.inspections i
  join public.restaurant_canonical_members member
    on member.restaurant_id = i.restaurant_id
  where member.canonical_facility_id = p_canonical_facility_id;

  if v_total_count = 0 then
    delete from public.inspection_profiles where restaurant_id = v_restaurant_id;
    return;
  end if;

  select array_agg(recent.official_score order by recent.inspection_date desc, recent.id desc)
  into v_recent_scores
  from (
    select i.id, i.inspection_date, i.official_score
    from public.inspections i
    join public.restaurant_canonical_members member
      on member.restaurant_id = i.restaurant_id
    where member.canonical_facility_id = p_canonical_facility_id
    order by i.inspection_date desc, i.id desc
    limit 4
  ) recent;

  v_recent_count := array_length(v_recent_scores, 1);
  for v_index in 1..v_recent_count loop
    v_weight_total := v_weight_total + v_weights[v_index];
    v_weighted_total := v_weighted_total + v_recent_scores[v_index] * v_weights[v_index];
  end loop;
  v_weighted_history := v_weighted_total / v_weight_total;

  select coalesce(stddev_pop(score), 0)
  into v_standard_deviation
  from unnest(v_recent_scores) as scores(score);

  v_consistency_adjustment := -least(5::numeric, v_standard_deviation * 0.25);
  v_trend_adjustment := case
    when v_recent_count > 1 then greatest(
      -3::numeric,
      least(3::numeric, ((v_recent_scores[1] - v_recent_scores[v_recent_count]) / (v_recent_count - 1)) * 0.65)
    )
    else 0
  end;
  v_profile_score := round(greatest(
    0::numeric,
    least(100::numeric, v_weighted_history + v_consistency_adjustment + v_trend_adjustment)
  ))::integer;

  insert into public.inspection_profiles (
    restaurant_id,
    profile_score,
    confidence,
    weighted_history_score,
    consistency_adjustment,
    trend_adjustment,
    inspection_count,
    calculated_at,
    algorithm_version
  ) values (
    v_restaurant_id,
    v_profile_score,
    case
      when v_total_count <= 1 then 'Limited'
      when v_total_count = 2 then 'Moderate'
      when v_total_count <= 4 then 'Good'
      else 'High'
    end,
    v_weighted_history,
    v_consistency_adjustment,
    v_trend_adjustment,
    v_total_count,
    now(),
    'v1'
  )
  on conflict (restaurant_id) do update set
    profile_score = excluded.profile_score,
    confidence = excluded.confidence,
    weighted_history_score = excluded.weighted_history_score,
    consistency_adjustment = excluded.consistency_adjustment,
    trend_adjustment = excluded.trend_adjustment,
    inspection_count = excluded.inspection_count,
    calculated_at = excluded.calculated_at,
    algorithm_version = excluded.algorithm_version;
end;
$$;

revoke all on function public.refresh_canonical_restaurant_profile(text) from public, anon, authenticated;
grant execute on function public.refresh_canonical_restaurant_profile(text) to service_role;

create or replace function public.refresh_profiles_after_duplicate_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duplicate_restaurant_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_canonical_restaurant_profile(old.canonical_facility_id);
    perform public.refresh_canonical_restaurant_profile(old.duplicate_facility_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select id into v_duplicate_restaurant_id
    from public.restaurants
    where facility_id = new.duplicate_facility_id;

    if v_duplicate_restaurant_id is not null then
      delete from public.inspection_profiles where restaurant_id = v_duplicate_restaurant_id;
    end if;
    perform public.refresh_canonical_restaurant_profile(new.canonical_facility_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_duplicate_rules_refresh_profiles on public.restaurant_duplicate_rules;
create trigger restaurant_duplicate_rules_refresh_profiles
after insert or update or delete on public.restaurant_duplicate_rules
for each row execute function public.refresh_profiles_after_duplicate_rule();

create or replace view public.restaurant_explorer with (security_invoker = true) as
select
  r.id,
  r.facility_id,
  r.city_code,
  r.route_number::text as route_id,
  r.name,
  r.address,
  r.zip_code,
  location.latitude,
  location.longitude,
  p.profile_score,
  p.confidence,
  p.weighted_history_score,
  p.consistency_adjustment,
  p.trend_adjustment,
  p.inspection_count,
  latest.official_score as latest_official_score,
  latest.inspection_date as latest_inspection_date,
  coalesce(history.inspections, '[]'::jsonb) as inspections,
  rating.source as community_source,
  rating.source_business_id,
  rating.rating as community_rating,
  rating.review_count as community_review_count,
  rating.source_url as community_source_url,
  rating.matched_at as community_matched_at,
  rating.refreshed_at as community_refreshed_at,
  rating.match_confidence as community_match_confidence,
  aliases.route_aliases,
  aliases.facility_aliases,
  aliases.search_text
from public.restaurants r
join public.inspection_profiles p on p.restaurant_id = r.id
left join lateral (
  select member_restaurant.latitude, member_restaurant.longitude
  from public.restaurant_canonical_members member
  join public.restaurants member_restaurant on member_restaurant.id = member.restaurant_id
  where member.canonical_facility_id = r.facility_id
    and member_restaurant.latitude is not null
    and member_restaurant.longitude is not null
  order by (member_restaurant.id = r.id) desc, member_restaurant.route_number
  limit 1
) location on true
left join lateral (
  select i.official_score, i.inspection_date
  from public.inspections i
  join public.restaurant_canonical_members member on member.restaurant_id = i.restaurant_id
  where member.canonical_facility_id = r.facility_id
  order by i.inspection_date desc, i.id desc
  limit 1
) latest on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'date', recent.inspection_date,
    'score', recent.official_score,
    'processDescription', recent.process_description
  ) order by recent.inspection_date desc, recent.id desc) as inspections
  from (
    select i.id, i.inspection_date, i.official_score, i.process_description
    from public.inspections i
    join public.restaurant_canonical_members member on member.restaurant_id = i.restaurant_id
    where member.canonical_facility_id = r.facility_id
    order by i.inspection_date desc, i.id desc
    limit 5
  ) recent
) history on true
left join lateral (
  select c.*
  from public.community_ratings c
  join public.restaurant_canonical_members member on member.restaurant_id = c.restaurant_id
  where member.canonical_facility_id = r.facility_id
  order by (c.restaurant_id = r.id) desc, c.match_confidence desc, c.refreshed_at desc
  limit 1
) rating on true
left join lateral (
  select
    coalesce(jsonb_agg(member_restaurant.route_number::text order by member_restaurant.route_number)
      filter (where member_restaurant.id <> r.id), '[]'::jsonb) as route_aliases,
    coalesce(jsonb_agg(member_restaurant.facility_id order by member_restaurant.route_number)
      filter (where member_restaurant.id <> r.id), '[]'::jsonb) as facility_aliases,
    string_agg(member_restaurant.name || ' ' || member_restaurant.address, ' ') as search_text
  from public.restaurant_canonical_members member
  join public.restaurants member_restaurant on member_restaurant.id = member.restaurant_id
  where member.canonical_facility_id = r.facility_id
) aliases on true
where r.active
  and not exists (
    select 1 from public.restaurant_duplicate_rules rule
    where rule.duplicate_facility_id = r.facility_id
  );

create or replace view public.restaurants_needing_geocode with (security_invoker = true) as
select r.id, r.route_number, r.name, r.address, r.zip_code
from public.restaurants r
where r.active
  and not exists (
    select 1 from public.restaurant_duplicate_rules rule
    where rule.duplicate_facility_id = r.facility_id
  )
  and not exists (
    select 1
    from public.restaurant_canonical_members member
    join public.restaurants member_restaurant on member_restaurant.id = member.restaurant_id
    where member.canonical_facility_id = r.facility_id
      and member_restaurant.latitude is not null
      and member_restaurant.longitude is not null
  )
order by r.route_number;

create or replace view public.restaurants_needing_rating with (security_invoker = true) as
select
  r.id,
  r.route_number,
  r.name,
  r.address,
  location.latitude,
  location.longitude
from public.restaurants r
left join lateral (
  select member_restaurant.latitude, member_restaurant.longitude
  from public.restaurant_canonical_members member
  join public.restaurants member_restaurant on member_restaurant.id = member.restaurant_id
  where member.canonical_facility_id = r.facility_id
    and member_restaurant.latitude is not null
    and member_restaurant.longitude is not null
  order by (member_restaurant.id = r.id) desc, member_restaurant.route_number
  limit 1
) location on true
where r.active
  and not exists (
    select 1 from public.restaurant_duplicate_rules rule
    where rule.duplicate_facility_id = r.facility_id
  )
  and not exists (
    select 1
    from public.community_ratings c
    join public.restaurant_canonical_members member on member.restaurant_id = c.restaurant_id
    where member.canonical_facility_id = r.facility_id
  )
order by r.route_number;

grant select on public.restaurant_explorer, public.restaurants_needing_geocode,
  public.restaurants_needing_rating to anon, authenticated;

-- First reviewed merge: the former OOB permit and current Titaya's permit are
-- the same establishment at the same coordinates with non-overlapping history.
insert into public.restaurant_duplicate_rules (
  duplicate_facility_id,
  canonical_facility_id,
  reason,
  reviewed_by
) values (
  '2803076',
  '178308',
  'Same establishment: normalized name and address match, identical coordinates, and inspection histories do not overlap.',
  'manual-review'
)
on conflict (duplicate_facility_id) do update set
  canonical_facility_id = excluded.canonical_facility_id,
  reason = excluded.reason,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = now();
