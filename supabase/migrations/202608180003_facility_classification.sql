-- Conservative facility classification. Only high-confidence schools and
-- healthcare institutions are hidden by the default API query; all source
-- records remain available through the "show all" filter.

alter table public.restaurants
  add column if not exists facility_category text not null default 'other',
  add column if not exists classification_confidence numeric not null default 0.5,
  add column if not exists classification_method text not null default 'unclassified',
  add column if not exists classification_locked boolean not null default false;

alter table public.restaurants
  drop constraint if exists restaurants_facility_category_check;
alter table public.restaurants
  add constraint restaurants_facility_category_check
  check (facility_category in ('school', 'healthcare', 'other'));

alter table public.restaurants
  drop constraint if exists restaurants_classification_confidence_check;
alter table public.restaurants
  add constraint restaurants_classification_confidence_check
  check (classification_confidence between 0 and 1);

create index if not exists restaurants_facility_category_idx
  on public.restaurants (facility_category);

create or replace function public.preserve_locked_restaurant_classification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.classification_locked and new.classification_method = 'rules-v1' then
    new.facility_category := old.facility_category;
    new.classification_confidence := old.classification_confidence;
    new.classification_method := old.classification_method;
    new.classification_locked := true;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_preserve_locked_classification on public.restaurants;
create trigger restaurants_preserve_locked_classification
before update of facility_category, classification_confidence, classification_method, classification_locked
on public.restaurants for each row
execute function public.preserve_locked_restaurant_classification();

update public.restaurants
set
  facility_category = case
    when lower(name) ~ '(elementary|middle school|high school|preschool|pre-school|montessori|child ?care|day ?care|head start|independent school district|(^|[^a-z])isd([^a-z]|$))'
      then 'school'
    when lower(name) ~ '\m(hospital|medical center|nursing|assisted living|senior living|rehabilitation|hospice|memory care|healthcare center|health care center)\M'
      then 'healthcare'
    else 'other'
  end,
  classification_confidence = case
    when lower(name) ~ '(elementary|middle school|high school|preschool|pre-school|montessori|child ?care|day ?care|head start|independent school district|(^|[^a-z])isd([^a-z]|$))'
      or lower(name) ~ '\m(hospital|medical center|nursing|assisted living|senior living|rehabilitation|hospice|memory care|healthcare center|health care center)\M'
      then 0.98
    else 0.5
  end,
  classification_method = 'rules-v1'
where not classification_locked;

create or replace view public.restaurant_explorer_classified with (security_invoker = true) as
select
  explorer.*,
  r.facility_category,
  r.classification_confidence,
  r.classification_method
from public.restaurant_explorer explorer
join public.restaurants r on r.id = explorer.id;

grant select on public.restaurant_explorer_classified to anon, authenticated;
