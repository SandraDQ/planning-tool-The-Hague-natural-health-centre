#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# pnpm test:db — run the database tests on a throwaway Postgres 16 cluster.
#
#  1. initdb a temporary cluster (unix socket only, no TCP port is opened)
#  2. apply supabase/test-support/auth_stub.sql   (LOCAL ONLY Supabase stand-in)
#  3. apply supabase/migrations/*.sql in order
#  4. apply supabase/seed.sql and supabase/test-support/test_helpers.sql
#  5. run every tests/db/*.sql (each in its own transaction, rolled back)
#
# Exits non-zero on any error. The cluster is deleted afterwards.
# Env: PG_BIN (default /usr/lib/postgresql/16/bin), KEEP_TEST_DB=1 to keep it.
# When run as root, Postgres runs as the 'postgres' OS user (initdb refuses root).
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
if [[ ! -x "$PG_BIN/initdb" ]]; then
  if command -v pg_config >/dev/null 2>&1 && [[ -x "$(pg_config --bindir)/initdb" ]]; then
    PG_BIN="$(pg_config --bindir)"
  else
    echo "test-db: Postgres binaries not found (set PG_BIN)" >&2
    exit 2
  fi
fi

PG_USER=""
if [[ "$(id -u)" == "0" ]]; then
  if id postgres >/dev/null 2>&1; then
    PG_USER="postgres"
  else
    echo "test-db: running as root but no 'postgres' OS user exists" >&2
    exit 2
  fi
fi

as_pg() {
  if [[ -n "$PG_USER" ]]; then
    runuser -u "$PG_USER" -- "$@"
  else
    "$@"
  fi
}

# Must be traversable by the postgres user, so not under /root.
WORK="$(mktemp -d /tmp/thnhc-testdb.XXXXXX)"
PORT=54329   # only names the socket file inside $WORK; no TCP listener
DB=thnhc_test
[[ -n "$PG_USER" ]] && chown "$PG_USER" "$WORK"

cleanup() {
  as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  if [[ "${KEEP_TEST_DB:-0}" != "1" ]]; then
    rm -rf "$WORK"
  else
    echo "test-db: kept cluster in $WORK (socket dir, port $PORT)"
  fi
}
trap cleanup EXIT

as_pg "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust -E UTF8 --no-locale >"$WORK/initdb.log" 2>&1 \
  || { cat "$WORK/initdb.log" >&2; exit 1; }

as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/postgres.log" -w \
  -o "-c listen_addresses='' -k $WORK -p $PORT -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c timezone=UTC" \
  start >/dev/null \
  || { cat "$WORK/postgres.log" >&2; exit 1; }

PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 --set=VERBOSITY=default)

"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null

apply() {
  local file="$1"
  if ! out="$("${PSQL[@]}" -d "$DB" -f "$file" 2>&1)"; then
    echo "test-db: FAILED applying ${file#"$ROOT"/}" >&2
    echo "$out" >&2
    exit 1
  fi
}

echo "test-db: applying auth stub, migrations, seed"
# pg_cron is not available locally; migration 0010 refuses to run without it
# unless this (local-only) setting is on.
export PGOPTIONS="-c thnhc.allow_missing_pg_cron=on"
apply "$ROOT/supabase/test-support/auth_stub.sql"
shopt -s nullglob
migrations=("$ROOT"/supabase/migrations/*.sql)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "test-db: no migrations found" >&2
  exit 1
fi
for f in "${migrations[@]}"; do
  apply "$f"
  echo "  applied ${f#"$ROOT"/}"
done
apply "$ROOT/supabase/seed.sql"
echo "  applied supabase/seed.sql"
# Seed must be re-runnable
apply "$ROOT/supabase/seed.sql"
apply "$ROOT/supabase/test-support/test_helpers.sql"

tests=("$ROOT"/tests/db/*.sql)
if [[ ${#tests[@]} -eq 0 ]]; then
  echo "test-db: no tests in tests/db" >&2
  exit 1
fi

passed=0
failed=0
assertions=0
for f in "${tests[@]}"; do
  name="${f#"$ROOT"/}"
  # query results go to /dev/null; notices (ok - ...) and errors arrive on stderr
  if out="$("${PSQL[@]}" -d "$DB" -o /dev/null -f "$f" 2>&1)"; then
    n="$(grep -c 'NOTICE:  ok - ' <<<"$out" || true)"
    assertions=$((assertions + n))
    passed=$((passed + 1))
    echo "PASS $name ($n assertions)"
    grep 'NOTICE:  ok - ' <<<"$out" | sed -E 's/^.*NOTICE:  ok - /  ok - /' || true
  else
    failed=$((failed + 1))
    echo "FAIL $name"
    grep -v 'NOTICE:  ok - ' <<<"$out" | sed 's/^/  /' || true
  fi
done

# --- Concurrency (MASTER_PROMPT 15): two real sessions race for the same slot.
# Session A inserts and keeps its transaction open for 1 s; session B tries the
# same slot meanwhile. Whatever the timing, exactly one may succeed.
race() {
  local label="$1" sql_a="$2" sql_b="$3" rc
  ( rc=0
    printf 'begin;\n%s\nselect pg_sleep(1);\ncommit;\n' "$sql_a" \
      | "${PSQL[@]}" -d "$DB" -o /dev/null -f - >"$WORK/race_a.log" 2>&1 || rc=$?
    echo "$rc" >"$WORK/race_a.rc" ) &
  ( rc=0
    sleep 0.3
    printf 'begin;\n%s\ncommit;\n' "$sql_b" \
      | "${PSQL[@]}" -d "$DB" -o /dev/null -f - >"$WORK/race_b.log" 2>&1 || rc=$?
    echo "$rc" >"$WORK/race_b.rc" ) &
  wait
  local ok=0
  [[ "$(cat "$WORK/race_a.rc")" == "0" ]] && ok=$((ok + 1))
  [[ "$(cat "$WORK/race_b.rc")" == "0" ]] && ok=$((ok + 1))
  if [[ $ok -eq 1 ]] && grep -qh 'exclusion constraint' "$WORK/race_a.log" "$WORK/race_b.log"; then
    passed=$((passed + 1)); assertions=$((assertions + 1))
    echo "PASS concurrency: $label (exactly one of two simultaneous sessions succeeded)"
  else
    failed=$((failed + 1))
    echo "FAIL concurrency: $label ($ok of 2 sessions succeeded)"
    sed 's/^/  /' "$WORK/race_a.log" "$WORK/race_b.log"
  fi
}

block_sql() {  # therapist code
  echo "insert into public.room_blocks (room_id, therapist_id, period)
        values (tests.room(2), tests.therapist('$1'),
                tstzrange('2027-06-07 08:00 Europe/Amsterdam', '2027-06-07 12:00 Europe/Amsterdam', '[)'));"
}
book_sql() {  # client number
  echo "select tests.book(tests.therapist('A'), 1, tests.session_type('A60'),
                          '2027-06-07 09:00 Europe/Amsterdam', tests.client($1), 'held');"
}

"${PSQL[@]}" -d "$DB" -o /dev/null -c "select tests.setup()" \
  -c "select tests.block(tests.therapist('A'), 1, '2027-06-07 08:00 Europe/Amsterdam', '2027-06-07 12:00 Europe/Amsterdam')"
race "two therapists reserve the same block" "$(block_sql A)" "$(block_sql B)"
race "two clients book the same slot" "$(book_sql 1)" "$(book_sql 2)"

echo
echo "test-db: $passed passed, $failed failed, $assertions assertions"
[[ $failed -eq 0 ]]
