-- Hex cell dimensions need fractional precision to tile without edge drift, but
-- map_hex_width / map_hex_height were integer columns (rejecting/rounding floats).
-- Widen them to double precision.

alter table maps alter column map_hex_width  type double precision using map_hex_width::double precision;
alter table maps alter column map_hex_height type double precision using map_hex_height::double precision;
