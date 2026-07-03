#!/usr/bin/env bash
#
# check-drift.sh — detect drift between LIVE prod and the migrations.
#
# "The migrations are the source of truth" only holds if a from-scratch apply of
# supabase/migrations reproduces prod. This compares a from-scratch LOCAL apply
# against the live DB along the two axes that matter and that `supabase db diff`
# handles poorly on its own: RLS policies (public + storage) and, via db diff,
# table/column schema.
#
# Usage:
#   supabase start                 # local stack applies every migration from scratch
#   LIVE_DB_URL="postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres" \
#     bash deploy/check-drift.sh
#
# Reading the RLS diff:
#   '-' line = policy exists in migrations(local) but NOT live  -> live is behind, or was hand-reverted
#   '+' line = policy exists in live but NOT migrations          -> DRIFT: capture it into a forward migration
set -euo pipefail

PSQL="${PSQL:-psql}"
command -v "$PSQL" >/dev/null || PSQL=/opt/homebrew/opt/libpq/bin/psql
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
: "${LIVE_DB_URL:?set LIVE_DB_URL to the live project session-pooler connection}"

# Deterministic fingerprint of every RLS policy in the app-owned schemas.
fp() {
  "$PSQL" "$1" -Atc "
    select schemaname||'|'||tablename||'|'||policyname||'|'||cmd||'|'||
           array_to_string(roles, ',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
    from pg_policies
    where schemaname in ('public','storage')
    order by 1"
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fp "$LOCAL_DB_URL" > "$tmp/local.fp"
fp "$LIVE_DB_URL"  > "$tmp/live.fp"

echo "== RLS policy drift: migrations(local, left) vs live (right) =="
if diff -u --label migrations "$tmp/local.fp" --label live "$tmp/live.fp"; then
  echo "  ✔ RLS policies match"
  drift=0
else
  echo "  ✖ policy drift above — capture '+' (live-only) lines into a new migration"
  drift=1
fi

echo
echo "== schema drift (supabase db diff --linked, public schema) =="
if command -v supabase >/dev/null; then
  supabase db diff --linked --schema public || true
else
  echo "  (supabase CLI not found — skip; run 'supabase db diff --linked' manually)"
fi

exit $drift
