-- Decouples map/list coordinate coverage from Google Places enrichment.
-- restaurants_needing_geocode drives a free (Census Bureau) geocoding pass;
-- restaurants_needing_rating drives Google Places as optional rating enrichment only.

create or replace view public.restaurants_needing_geocode with (security_invoker = true) as
select id, route_number, name, address, zip_code
from public.restaurants
where active and (latitude is null or longitude is null)
order by route_number;

create or replace view public.restaurants_needing_rating with (security_invoker = true) as
select r.id, r.route_number, r.name, r.address, r.latitude, r.longitude
from public.restaurants r
left join public.community_ratings c on c.restaurant_id = r.id
where r.active and c.restaurant_id is null
order by r.route_number;
