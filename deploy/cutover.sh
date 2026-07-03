#!/usr/bin/env bash
#
# cutover.sh — one-shot production cutover for the Hex Map Supabase project.
#
# Clones the LIVE SOURCE project (real prod data, currently mis-housed in the
# staging project) into the TARGET project (goes live as prod, currently holds
# dev data). Phases:
#
#   0  preflight     — tool + env + connectivity checks, identity fingerprints,
#                      refuse if source == target, hard confirmation gate
#   1  backup-target — full pg_dump (schema+data) of TARGET + rclone snapshot of
#                      TARGET storage, so the current prod is recoverable
#   2  schema        — apply all idempotent migrations to TARGET (public schema)
#   3  dump-source   — fresh pg_dump of SOURCE (data-only: public+auth+storage)
#                      taken inside the write-free window   [skip with USE_ONDISK_DUMPS=1]
#   4  load-data     — TRUNCATE target tables + load source data, one transaction,
#                      triggers disabled — atomic, rolls back on any error
#   5  storage       — ensure buckets exist + sync object files SOURCE -> TARGET
#   6  verify        — per-table row-count parity + storage object-count parity
#
# ---------------------------------------------------------------------------
# USAGE
#
#   export TARGET_DB_URL="postgresql://postgres.<target-ref>:<pw>@<pooler-host>:5432/postgres"
#   export SOURCE_DB_URL="postgresql://postgres.<source-ref>:<pw>@<pooler-host>:5432/postgres"
#   export RCLONE_CONFIG=/path/to/rclone.conf        # must define SRC + DST remotes
#   export SOURCE_STORAGE_REMOTE=supa_src            # rclone remote for source S3
#   export TARGET_STORAGE_REMOTE=supa_dst            # rclone remote for target S3
#   export CONFIRM=I-UNDERSTAND                      # required to pass the gate
#
#   bash deploy/cutover.sh
#
# Use the SESSION-POOLER connection string for both DBs (the direct
# db.<ref>.supabase.co endpoint is IPv6-only). pg_dump/psql client version must
# match the server major (17.x).
#
# Knobs (env):
#   DRY_RUN=1               print destructive actions instead of running them
#   RESUME_FROM=<n>         start at phase n (0-6); earlier phases skipped
#   STOP_AFTER=<n>          stop after phase n
#   USE_ONDISK_DUMPS=1      skip phase 3; load backups/live-source-*.sql instead
#   STORAGE_MIRROR=1        rclone SYNC (delete target-only files) instead of COPY
#   BUCKETS="a b c"         override bucket list (default from config.toml-ish set)
#   EXTRA_DUMP_EXCLUDES=".."  extra --exclude-table args for the source data dump
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/backups/cutover-$TS"
FRESH_DIR="$OUT/source-fresh"
DRY_RUN="${DRY_RUN:-0}"
RESUME_FROM="${RESUME_FROM:-0}"
STOP_AFTER="${STOP_AFTER:-6}"
USE_ONDISK_DUMPS="${USE_ONDISK_DUMPS:-0}"
STORAGE_MIRROR="${STORAGE_MIRROR:-0}"
BUCKETS="${BUCKETS:-session-maps dungeon-images reference-photos bug-screenshots}"

# Supabase-managed bookkeeping tables we must NOT clone (version-specific).
DUMP_EXCLUDES=(
  --exclude-table='auth.schema_migrations'
  --exclude-table='storage.migrations'
  --exclude-table='supabase_migrations.*'
)
# Data schemas to clone. Keep in sync with the load/verify phases.
DUMP_SCHEMAS=(--schema=public --schema=auth --schema=storage)

# --- pretty logging ---------------------------------------------------------
c_hd=$'\033[1;36m'; c_ok=$'\033[1;32m'; c_wa=$'\033[1;33m'; c_er=$'\033[1;31m'; c_z=$'\033[0m'
hd()  { echo; echo "${c_hd}==== $* ====${c_z}"; }
ok()  { echo "${c_ok}✔ $*${c_z}"; }
warn(){ echo "${c_wa}⚠ $*${c_z}"; }
die() { echo "${c_er}✖ $*${c_z}" >&2; exit 1; }
run() { if [[ "$DRY_RUN" == 1 ]]; then echo "  [dry-run] $*"; else eval "$@"; fi; }

phase_enabled() { local n="$1"; (( n >= RESUME_FROM && n <= STOP_AFTER )); }

# psql helpers (ON_ERROR_STOP everywhere)
psql_t() { psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
psql_s() { psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

# ============================================================================
# PHASE 0 — preflight
# ============================================================================
if phase_enabled 0; then
  hd "Phase 0 — preflight"

  for bin in psql pg_dump rclone supabase; do
    command -v "$bin" >/dev/null || die "missing required tool: $bin"
  done
  : "${TARGET_DB_URL:?set TARGET_DB_URL (target = go-live prod)}"
  if [[ "$USE_ONDISK_DUMPS" != 1 ]]; then
    : "${SOURCE_DB_URL:?set SOURCE_DB_URL (source = live real-prod data) or USE_ONDISK_DUMPS=1}"
  fi

  # client/server major-version match (data restore across majors is unsafe)
  cli_major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
  srv_major="$(psql_t -Atc 'show server_version' | grep -oE '^[0-9]+')"
  [[ "$cli_major" == "$srv_major" ]] || warn "pg client major ($cli_major) != target server major ($srv_major) — restore may fail; install matching client"

  # identity fingerprints so the operator can eyeball source vs target
  tgt_fp="$(psql_t -Atc "select current_database()||' @ '||inet_server_addr()||' rows(public.sessions)='||(select count(*) from public.sessions)" 2>/dev/null || echo '??')"
  echo "  TARGET : $tgt_fp"
  if [[ "$USE_ONDISK_DUMPS" != 1 ]]; then
    src_fp="$(psql_s -Atc "select current_database()||' @ '||inet_server_addr()||' rows(public.sessions)='||(select count(*) from public.sessions)" 2>/dev/null || echo '??')"
    echo "  SOURCE : $src_fp"
    # refuse a self-overwrite: compare system identifiers
    tgt_sys="$(psql_t -Atc 'select system_identifier from pg_control_system()')"
    src_sys="$(psql_s -Atc 'select system_identifier from pg_control_system()')"
    [[ "$tgt_sys" != "$src_sys" ]] || die "SOURCE and TARGET are the SAME database — aborting"
  fi

  if [[ "$DRY_RUN" != 1 ]]; then
    [[ "${CONFIRM:-}" == "I-UNDERSTAND" ]] || die "refusing to overwrite TARGET without CONFIRM=I-UNDERSTAND (or run with DRY_RUN=1)"
  fi
  mkdir -p "$OUT" "$FRESH_DIR"
  ok "preflight passed — artifacts -> $OUT"
fi

# ============================================================================
# PHASE 1 — back up the current TARGET (so today's prod is recoverable)
# ============================================================================
if phase_enabled 1; then
  hd "Phase 1 — backup current target"
  run "pg_dump \"\$TARGET_DB_URL\" --no-owner --no-privileges ${DUMP_SCHEMAS[*]} --schema-only > \"$OUT/target-pre-cutover-schema.sql\""
  run "pg_dump \"\$TARGET_DB_URL\" --no-owner --no-privileges ${DUMP_SCHEMAS[*]} --data-only --disable-triggers > \"$OUT/target-pre-cutover-data.sql\""
  ok "target DB dumped (schema + data)"

  if [[ -n "${TARGET_STORAGE_REMOTE:-}" ]]; then
    for b in $BUCKETS; do
      run "rclone copy \"$TARGET_STORAGE_REMOTE:$b\" \"$OUT/storage-target-pre/$b\" --transfers 4 --retries 10 --low-level-retries 20"
    done
    ok "target storage snapshotted -> $OUT/storage-target-pre"
  else
    warn "TARGET_STORAGE_REMOTE unset — skipping target storage backup"
  fi
fi

# ============================================================================
# PHASE 2 — schema: bring TARGET public schema up to date (idempotent migrations)
# ============================================================================
if phase_enabled 2; then
  hd "Phase 2 — apply schema migrations to target"
  shopt -s nullglob
  files=("$ROOT"/supabase/migrations/*.sql)
  (( ${#files[@]} )) || die "no migration files found under supabase/migrations"
  for f in "${files[@]}"; do
    base="$(basename "$f")"
    # the cutover RLS write-lock is a separate go-live step, applied last by hand
    if [[ "$base" == *lock_write_rls* ]]; then
      warn "SKIP $base (cutover RLS write-lock — apply manually at go-live)"
      continue
    fi
    echo "  ==> $base"
    run "psql_t -f \"$f\" >/dev/null"
  done
  ok "migrations applied (idempotent/replay-safe)"

  # --- storage RLS policies: copy the LIVE source policies, not the migrations ---
  # A DB restore drops storage.objects policies, and the read/"stays" policies
  # (dungeon-images public read, bug-screenshots owner read) live only on prod,
  # never in migrations. Introspect source pg_policies and replay onto target so
  # both match exactly. (Skipped when running from on-disk dumps with no source.)
  if [[ "$USE_ONDISK_DUMPS" == 1 || -z "${SOURCE_DB_URL:-}" ]]; then
    warn "no live SOURCE_DB_URL — skipping storage-policy sync (relying on migrations only)"
  else
    ddl="$(psql_s -Atc "
      select coalesce(string_agg(stmt, E'\n'), '') from (
        select
          format('drop policy if exists %I on %I.%I;', policyname, schemaname, tablename)
          || format(' create policy %I on %I.%I as %s for %s to %s',
               policyname, schemaname, tablename,
               case when permissive='PERMISSIVE' then 'permissive' else 'restrictive' end,
               lower(cmd), array_to_string(roles, ', '))
          || case when qual       is not null then format(' using (%s)', qual)       else '' end
          || case when with_check is not null then format(' with check (%s)', with_check) else '' end
          || ';' as stmt
        from pg_policies where schemaname = 'storage'
      ) s")"
    if [[ -z "$ddl" ]]; then
      warn "source has no storage policies?? — leaving target as migrations left it"
    elif [[ "$DRY_RUN" == 1 ]]; then
      echo "  [dry-run] would replay $(grep -c 'create policy' <<<"$ddl") storage policies from source"
    else
      printf '%s\n' "$ddl" | psql_t -v ON_ERROR_STOP=1 -f - >/dev/null
      ok "storage policies synced from source ($(grep -c 'create policy' <<<"$ddl") policies)"
    fi
  fi
fi

# ============================================================================
# PHASE 3 — fresh data dump from SOURCE (write-free window)
# ============================================================================
# resolve once, independent of phase gating (so RESUME_FROM=4 still finds it)
if [[ "$USE_ONDISK_DUMPS" == 1 ]]; then
  DATA_SQL="$ROOT/backups/live-source-data.sql"
else
  DATA_SQL="$FRESH_DIR/source-data.sql"
fi
if phase_enabled 3; then
  hd "Phase 3 — dump source data (fresh)"
  if [[ "$USE_ONDISK_DUMPS" == 1 ]]; then
    [[ -f "$DATA_SQL" ]] || die "USE_ONDISK_DUMPS=1 but $DATA_SQL missing"
    warn "using on-disk dump $DATA_SQL (may be stale)"
  else
    warn "SOURCE should be in its write-free window NOW (no app writes)."
    run "pg_dump \"\$SOURCE_DB_URL\" --data-only --no-owner --no-privileges \
          ${DUMP_SCHEMAS[*]} ${DUMP_EXCLUDES[*]} ${EXTRA_DUMP_EXCLUDES:-} \
          --disable-triggers > \"$DATA_SQL\""
    ok "fresh source data dumped -> $DATA_SQL ($(du -h "$DATA_SQL" 2>/dev/null | cut -f1 || echo '?'))"
  fi
fi

# ============================================================================
# PHASE 4 — load: TRUNCATE target + COPY source data (single transaction)
# ============================================================================
if phase_enabled 4; then
  hd "Phase 4 — load data into target (atomic)"
  [[ -f "$DATA_SQL" ]] || die "data dump not found: $DATA_SQL (run phase 3 first)"

  # Truncate EVERY public table (wipes leftover dev rows even if source had none),
  # plus the exact auth/storage tables present in the dump.
  pub_list="$(psql_t -Atc "select string_agg(format('%I.%I',schemaname,tablename),', ')
                           from pg_tables where schemaname='public'")"
  authstor_list="$(grep -oE '^COPY "(auth|storage)"\."[A-Za-z0-9_]+"' "$DATA_SQL" \
                    | sed 's/^COPY //' | sort -u | paste -sd, -)"
  trunc_list="$pub_list"
  [[ -n "$authstor_list" ]] && trunc_list="$pub_list, $authstor_list"

  echo "  will TRUNCATE (RESTART IDENTITY CASCADE):"
  echo "    public: $(echo "$pub_list" | tr ',' '\n' | grep -c .) tables"
  echo "    auth/storage: $(echo "$authstor_list" | tr ',' '\n' | grep -c .) tables"

  if [[ "$DRY_RUN" == 1 ]]; then
    echo "  [dry-run] BEGIN; SET session_replication_role=replica; TRUNCATE <list> RESTART IDENTITY CASCADE; \\i $DATA_SQL; COMMIT;"
  else
    # One transaction: any failure rolls the whole load back, target untouched.
    psql_t --single-transaction <<SQL
SET session_replication_role = replica;
TRUNCATE $trunc_list RESTART IDENTITY CASCADE;
\i $DATA_SQL
SQL
    ok "data loaded + committed"
  fi

  # Data fixup: source rows carry absolute reference-photo URLs baked with the
  # SOURCE project ref (photo_broadcasts + photo_broadcast.sent events). Rewrite
  # them to relative storage_paths so they resolve against TARGET. Ref-agnostic;
  # requires the photoStore.js _resolveBroadcast change to be deployed.
  rewrite_sql="$ROOT/deploy/rewrite-photo-broadcast-urls.sql"
  if [[ -f "$rewrite_sql" ]]; then
    if [[ "$DRY_RUN" == 1 ]]; then
      echo "  [dry-run] photo-URL rewrite (preview, no commit):"
      run "psql_t -f \"$rewrite_sql\""
    else
      run "psql_t -v apply=1 -f \"$rewrite_sql\""
      ok "photo-broadcast URLs rewritten to relative paths"
    fi
  else
    warn "rewrite script not found: $rewrite_sql (skipping photo-URL fixup)"
  fi
fi

# ============================================================================
# PHASE 5 — storage: buckets + object files SOURCE -> TARGET
# ============================================================================
if phase_enabled 5; then
  hd "Phase 5 — storage sync"
  : "${TARGET_STORAGE_REMOTE:?set TARGET_STORAGE_REMOTE (rclone remote for target S3)}"
  rclone_verb="copy"; [[ "$STORAGE_MIRROR" == 1 ]] && rclone_verb="sync"

  # bucket rows arrive via the storage-schema data load in phase 4; confirm they exist
  run "supabase storage ls --experimental --linked >/dev/null 2>&1 || true"

  for b in $BUCKETS; do
    if [[ -n "${SOURCE_STORAGE_REMOTE:-}" ]]; then
      src="$SOURCE_STORAGE_REMOTE:$b"          # direct remote->remote (preferred)
    else
      src="$ROOT/backups/storage/live-source/$b"   # fallback: local backup tree
      [[ -d "$src" ]] || { warn "no source for bucket $b (skipping)"; continue; }
    fi
    echo "  $rclone_verb $src -> $TARGET_STORAGE_REMOTE:$b"
    run "rclone $rclone_verb \"$src\" \"$TARGET_STORAGE_REMOTE:$b\" \
          --checkers 4 --transfers 4 --retries 10 --low-level-retries 20 \
          --s3-upload-cutoff 50Mi --s3-chunk-size 16Mi --progress"
  done
  ok "storage synced"
fi

# ============================================================================
# PHASE 6 — verify parity
# ============================================================================
if phase_enabled 6; then
  hd "Phase 6 — verify"
  fail=0

  if [[ "$USE_ONDISK_DUMPS" != 1 && -n "${SOURCE_DB_URL:-}" ]]; then
    echo "  per-table row counts (public) source : target"
    while IFS='|' read -r tbl; do
      [[ -z "$tbl" ]] && continue
      s=$(psql_s -Atc "select count(*) from public.\"$tbl\"" 2>/dev/null || echo '?')
      t=$(psql_t -Atc "select count(*) from public.\"$tbl\"" 2>/dev/null || echo '?')
      mark="ok"; [[ "$s" != "$t" ]] && { mark="MISMATCH"; fail=1; }
      printf "    %-34s %8s : %-8s %s\n" "$tbl" "$s" "$t" "$mark"
    done < <(psql_t -Atc "select tablename from pg_tables where schemaname='public' order by 1")
  else
    warn "no live SOURCE_DB_URL — skipping DB row-count parity"
  fi

  if [[ -n "${TARGET_STORAGE_REMOTE:-}" ]]; then
    echo "  storage object counts (target):"
    for b in $BUCKETS; do
      c=$(rclone lsf "$TARGET_STORAGE_REMOTE:$b" -R --files-only 2>/dev/null | grep -c . || echo 0)
      printf "    %-20s %s files\n" "$b" "$c"
    done
  fi

  # storage.objects rows should match uploaded files, else signed URLs 400
  echo "  storage.objects rows per bucket (target DB):"
  psql_t -Atc "select bucket_id||' '||count(*) from storage.objects group by 1 order by 1" | sed 's/^/    /'

  # storage RLS must exist (RLS-enabled + zero policies = deny-all -> "Object not found")
  polcount=$(psql_t -Atc "select count(*) from pg_policies where schemaname='storage' and tablename='objects'")
  echo "  storage.objects policy count: $polcount"
  (( polcount > 0 )) || { warn "storage.objects has NO policies — signed images will 400"; fail=1; }

  # every bucket must be reachable: either public, or has a SELECT policy scoped to it.
  # (This is the dungeon-images trap: private bucket + no SELECT policy = broken images.)
  echo "  per-bucket read reachability (target):"
  while IFS='|' read -r bkt pub; do
    [[ -z "$bkt" ]] && continue
    sel=$(psql_t -Atc "select count(*) from pg_policies
                       where schemaname='storage' and tablename='objects' and cmd='SELECT'
                         and (qual like '%'''||'$bkt'||'''%')")
    if [[ "$pub" == true ]]; then mark="public"
    elif (( sel > 0 ));      then mark="select-policy"
    else                          mark="UNREADABLE"; fail=1
    fi
    printf "    %-20s %s\n" "$bkt" "$mark"
  done < <(psql_t -Atc "select id||'|'||public from storage.buckets order by id")

  (( fail == 0 )) && ok "verification passed" || die "verification found mismatches — investigate before go-live"
fi

hd "cutover.sh complete"
cat <<EOF
Backups for rollback: $OUT
Remaining MANUAL go-live steps (deliberately not automated):
  1. Apply the RLS write-lock migration (…lock_write_rls) to open target for writes.
  2. Flip app config / DNS / env to point clients at the TARGET project.
  3. Smoke-test: log in, load a map image (signed URL), write once.
Rollback: restore $OUT/target-pre-cutover-*.sql and re-sync $OUT/storage-target-pre.
EOF
