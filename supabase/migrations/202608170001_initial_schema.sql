create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  facility_id text not null unique,
  city_code text not null default 'AUS',
  route_number bigint generated always as identity unique,
  name text not null,
  address text not null,
  zip_code text,
  latitude double precision,
  longitude double precision,
  location geography(point, 4326),
  active boolean not null default true,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_coordinates check (
    (latitude is null and longitude is null and location is null) or
    (latitude between -90 and 90 and longitude between -180 and 180 and location is not null)
  )
);

create index if not exists restaurants_location_gix on public.restaurants using gist (location);
create index if not exists restaurants_name_idx on public.restaurants using gin (to_tsvector('english', name || ' ' || address));

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source_row_id text not null unique,
  inspection_date date not null,
  official_score numeric(6, 3) not null check (official_score between 0 and 100),
  process_description text not null,
  source_payload jsonb not null,
  imported_at timestamptz not null default now()
);

create index if not exists inspections_restaurant_date_idx on public.inspections (restaurant_id, inspection_date desc);

create table if not exists public.inspection_profiles (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  profile_score integer not null check (profile_score between 0 and 100),
  confidence text not null check (confidence in ('Limited', 'Moderate', 'Good', 'High')),
  weighted_history_score numeric not null,
  consistency_adjustment numeric not null,
  trend_adjustment numeric not null,
  inspection_count integer not null,
  calculated_at timestamptz not null default now(),
  algorithm_version text not null
);

create table if not exists public.community_ratings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  source text not null check (source = 'Google Places'),
  source_business_id text not null unique,
  rating numeric(2, 1) not null check (rating between 0 and 5),
  review_count integer not null check (review_count >= 0),
  source_url text not null,
  match_confidence numeric not null check (match_confidence between 0 and 1),
  matched_at timestamptz not null,
  refreshed_at timestamptz not null
);

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text not null,
  retrieved_at timestamptz not null default now(),
  row_count integer,
  status text not null,
  details jsonb not null default '{}'::jsonb
);

create or replace function public.set_restaurant_location()
returns trigger language plpgsql as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  else
    new.location := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists restaurants_set_location on public.restaurants;
create trigger restaurants_set_location before insert or update of latitude, longitude, name, address
on public.restaurants for each row execute function public.set_restaurant_location();

create or replace view public.restaurant_explorer with (security_invoker = true) as
select
  r.id,
  r.facility_id,
  r.city_code,
  lpad(r.route_number::text, 2, '0') as route_id,
  r.name,
  r.address,
  r.zip_code,
  r.latitude,
  r.longitude,
  p.profile_score,
  p.confidence,
  p.weighted_history_score,
  p.consistency_adjustment,
  p.trend_adjustment,
  p.inspection_count,
  latest.official_score as latest_official_score,
  latest.inspection_date as latest_inspection_date,
  coalesce(history.inspections, '[]'::jsonb) as inspections,
  c.source as community_source,
  c.source_business_id,
  c.rating as community_rating,
  c.review_count as community_review_count,
  c.source_url as community_source_url,
  c.matched_at as community_matched_at,
  c.refreshed_at as community_refreshed_at,
  c.match_confidence as community_match_confidence
from public.restaurants r
join public.inspection_profiles p on p.restaurant_id = r.id
left join lateral (
  select i.official_score, i.inspection_date
  from public.inspections i where i.restaurant_id = r.id
  order by i.inspection_date desc limit 1
) latest on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'date', recent.inspection_date,
    'score', recent.official_score,
    'processDescription', recent.process_description
  ) order by recent.inspection_date desc) as inspections
  from (
    select i.id, i.inspection_date, i.official_score, i.process_description
    from public.inspections i where i.restaurant_id = r.id
    order by i.inspection_date desc limit 5
  ) recent
) history on true
left join public.community_ratings c on c.restaurant_id = r.id
where r.active;

alter table public.restaurants enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_profiles enable row level security;
alter table public.community_ratings enable row level security;

create policy "Public restaurants are readable" on public.restaurants for select using (true);
create policy "Public inspections are readable" on public.inspections for select using (true);
create policy "Public profiles are readable" on public.inspection_profiles for select using (true);
create policy "Public community ratings are readable" on public.community_ratings for select using (true);

grant usage on schema public to anon, authenticated;
grant select on public.restaurants, public.inspections, public.inspection_profiles, public.community_ratings, public.restaurant_explorer to anon, authenticated;
