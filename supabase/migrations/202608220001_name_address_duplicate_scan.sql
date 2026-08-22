-- Scanned every active restaurant for an exact normalized name+address match
-- against another active restaurant (scripts/find-name-address-duplicates.ts).
-- These 28 pairs each have non-overlapping inspection date ranges, matching
-- the pattern of Austin issuing a new facility_id on ownership change or
-- permit renewal at the same address. Canonical facility is the one with the
-- more recent inspection activity. Four additional matches found by the same
-- scan had overlapping inspection dates and were left out pending manual
-- review: 10969930/10969915 (Elroy & Ross Market), 10771946/2803691 (Express
-- Food Mart #5), 12398978/10300378 (Stop N Express), 10750623/12185895
-- (Tokyo Gardens Catering).

insert into public.restaurant_duplicate_rules (
  duplicate_facility_id,
  canonical_facility_id,
  reason,
  reviewed_by
) values
  ('12394083', '12400096', 'Same establishment: normalized name and address match. Facility 12394083 was last inspected 2023-12-14; facility 12400096 has been inspected since 2025-06-20 with no date overlap.', 'name-address-scan'),
  ('12394084', '12400094', 'Same establishment: normalized name and address match. Facility 12394084 was last inspected 2023-12-21; facility 12400094 has been inspected since 2025-07-31 with no date overlap.', 'name-address-scan'),
  ('12082102', '12401442', 'Same establishment: normalized name and address match. Facility 12082102 was last inspected 2024-06-26; facility 12401442 has been inspected since 2026-02-12 with no date overlap.', 'name-address-scan'),
  ('2803693', '178007', 'Same establishment: normalized name and address match. Facility 2803693 was last inspected 2024-03-29; facility 178007 has been inspected since 2026-04-28 with no date overlap.', 'name-address-scan'),
  ('2802263', '178787', 'Same establishment: normalized name and address match. Facility 2802263 was last inspected 2025-01-13; facility 178787 has been inspected since 2026-03-05 with no date overlap.', 'name-address-scan'),
  ('12185773', '178820', 'Same establishment: normalized name and address match. Facility 12185773 was last inspected 2025-07-18; facility 178820 has been inspected since 2026-04-13 with no date overlap.', 'name-address-scan'),
  ('11476315', '12400787', 'Same establishment: normalized name and address match. Facility 11476315 was last inspected 2024-03-06; facility 12400787 has been inspected since 2025-12-11 with no date overlap.', 'name-address-scan'),
  ('2800563', '12400413', 'Same establishment: normalized name and address match. Facility 2800563 was last inspected 2024-04-02; facility 12400413 has been inspected since 2025-03-06 with no date overlap.', 'name-address-scan'),
  ('12396688', '12401922', 'Same establishment: normalized name and address match. Facility 12396688 was last inspected 2024-09-25; facility 12401922 has been inspected since 2026-02-03 with no date overlap.', 'name-address-scan'),
  ('12399601', '179228', 'Same establishment: normalized name and address match. Facility 12399601 was last inspected 2025-01-15; facility 179228 has been inspected since 2026-02-06 with no date overlap.', 'name-address-scan'),
  ('12393290', '12400731', 'Same establishment: normalized name and address match. Facility 12393290 was last inspected 2024-03-14; facility 12400731 has been inspected since 2025-02-13 with no date overlap.', 'name-address-scan'),
  ('10830871', '12399559', 'Same establishment: normalized name and address match. Facility 10830871 was last inspected 2023-09-21; facility 12399559 has been inspected since 2024-02-22 with no date overlap.', 'name-address-scan'),
  ('10869258', '12401854', 'Same establishment: normalized name and address match. Facility 10869258 was last inspected 2024-10-16; facility 12401854 has been inspected since 2026-03-24 with no date overlap.', 'name-address-scan'),
  ('12397444', '12399155', 'Same establishment: normalized name and address match. Facility 12397444 was last inspected 2023-08-07; facility 12399155 has been inspected since 2024-05-28 with no date overlap.', 'name-address-scan'),
  ('12060335', '12399662', 'Same establishment: normalized name and address match. Facility 12060335 was last inspected 2023-12-20; facility 12399662 has been inspected since 2024-08-08 with no date overlap.', 'name-address-scan'),
  ('10524502', '177916', 'Same establishment: normalized name and address match. Facility 10524502 was last inspected 2024-10-17; facility 177916 has been inspected since 2026-05-07 with no date overlap.', 'name-address-scan'),
  ('12397191', '12401979', 'Same establishment: normalized name and address match. Facility 12397191 was last inspected 2024-12-31; facility 12401979 has been inspected since 2025-10-24 with no date overlap.', 'name-address-scan'),
  ('11589224', '12401443', 'Same establishment: normalized name and address match. Facility 11589224 was last inspected 2024-09-17; facility 12401443 has been inspected since 2025-10-23 with no date overlap.', 'name-address-scan'),
  ('12186654', '178926', 'Same establishment: normalized name and address match. Facility 12186654 was last inspected 2025-07-29; facility 178926 has been inspected since 2026-05-20 with no date overlap.', 'name-address-scan'),
  ('11872773', '12399735', 'Same establishment: normalized name and address match. Facility 11872773 was last inspected 2025-02-06; facility 12399735 has been inspected since 2025-07-31 with no date overlap.', 'name-address-scan'),
  ('12397263', '12401651', 'Same establishment: normalized name and address match. Facility 12397263 was last inspected 2024-10-22; facility 12401651 has been inspected since 2025-06-16 with no date overlap.', 'name-address-scan'),
  ('11683025', '12400248', 'Same establishment: normalized name and address match. Facility 11683025 was last inspected 2023-09-27; facility 12400248 has been inspected since 2025-07-22 with no date overlap.', 'name-address-scan'),
  ('12128393', '12400221', 'Same establishment: normalized name and address match. Facility 12128393 was last inspected 2023-12-18; facility 12400221 has been inspected since 2026-03-05 with no date overlap.', 'name-address-scan'),
  ('2803628', '12399080', 'Same establishment: normalized name and address match. Facility 2803628 was last inspected 2023-07-19; facility 12399080 has been inspected since 2024-10-24 with no date overlap.', 'name-address-scan'),
  ('11687789', '177866', 'Same establishment: normalized name and address match. Facility 11687789 was last inspected 2024-11-26; facility 177866 has been inspected since 2025-03-19 with no date overlap.', 'name-address-scan'),
  ('12393653', '12401179', 'Same establishment: normalized name and address match. Facility 12393653 was last inspected 2023-12-28; facility 12401179 has been inspected since 2025-05-27 with no date overlap.', 'name-address-scan'),
  ('12392972', '12400095', 'Same establishment: normalized name and address match. Facility 12392972 was last inspected 2023-07-06; facility 12400095 has been inspected since 2024-10-23 with no date overlap.', 'name-address-scan'),
  ('2800010', '12400228', 'Same establishment: normalized name and address match. Facility 2800010 was last inspected 2023-11-03; facility 12400228 has been inspected since 2026-02-18 with no date overlap.', 'name-address-scan')
on conflict (duplicate_facility_id) do update set
  canonical_facility_id = excluded.canonical_facility_id,
  reason = excluded.reason,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = now();
