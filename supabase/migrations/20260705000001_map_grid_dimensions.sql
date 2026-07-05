-- GM-adjustable hex grid extent.
-- NULL means "use the client default" (90 columns / 40 rows, or auto-fit to the
-- background image), so existing maps keep rendering exactly as before until a
-- GM changes the size.

alter table maps add column if not exists map_grid_cols integer;
alter table maps add column if not exists map_grid_rows integer;
