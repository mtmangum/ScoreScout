-- restaurant_explorer previously derived route_id via lpad(route_number::text, 2, '0'),
-- which pads short numbers but *truncates* longer ones (Postgres lpad cuts from the
-- right when the input exceeds the target width). With thousands of restaurants,
-- every route_number >= 100 collided with others sharing the same leading two digits
-- (e.g. 180-189, 1800-1899 all became "18"), causing restaurant deep links and list
-- clicks to resolve to the wrong restaurant. route_number is already unique, so drop
-- the padding entirely and use it as-is.

create or replace view public.restaurant_explorer with (security_invoker = true) as
select
  r.id,
  r.facility_id,
  r.city_code,
  r.route_number::text as route_id,
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
