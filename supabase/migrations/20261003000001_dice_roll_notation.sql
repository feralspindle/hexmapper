-- dice rolls now go through the vendored engine, which supports the full
-- notation surface (exploding dice, keeps, rerolls, success counting). rolls
-- store the exact notation used; results gain optional per-die fields
-- (dropped, exploded_from, rerolled_from) that older rows simply lack.

alter table dice_rolls add column if not exists notation text;
