#!/usr/bin/env bash
# Phase 0 tooling spike — Salon Management System API contract.
#
# Answers the four questions that decide how negative scenarios may be verified
# through the mock (see logs/2026-10-26-api-design-plan.md, section 8.2):
#
#   Q1  Does Redocly lint the smoke specification with the configured ruleset?
#   Q2  Does Prism start from the specification and serve documented paths?
#   Q3  Does Prism honour `Prefer: code=409` and return the documented 409 body?
#   Q4  What does Prism return for a schema-invalid request body, and does that
#       body match our `Problem` schema?
#
# Usage:  bash spike/run-spike.sh
# Requires: node_modules installed (`npm install` in spec/api).
# Writes:  spike/spike-report.txt and spike/prism.log

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$HERE")"
SPEC="$HERE/smoke.yaml"
REPORT="$HERE/spike-report.txt"
PRISM_LOG="$HERE/prism.log"
PORT="${SPIKE_PORT:-4011}"
# Prism mounts the specification's `paths` at the server root and ignores the
# path component of `servers[].url`. The contract keeps the canonical /api/v1
# base path; the mock is therefore reached without that prefix.
BASE="http://127.0.0.1:${PORT}"
PRISM_BIN="$API_DIR/node_modules/.bin/prism"
REDOCLY_BIN="$API_DIR/node_modules/.bin/redocly"

pass=0
fail=0
prism_pid=""

cleanup() {
  if [ -n "$prism_pid" ] && kill -0 "$prism_pid" 2>/dev/null; then
    kill "$prism_pid" 2>/dev/null
    wait "$prism_pid" 2>/dev/null
  fi
}
trap cleanup EXIT

record() { # record <PASS|FAIL> <label> <detail>
  if [ "$1" = "PASS" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
  printf '[%s] %s\n      %s\n\n' "$1" "$2" "$3" >>"$REPORT"
}

: >"$REPORT"
{
  echo "Phase 0 tooling spike — $(date -Iseconds)"
  echo "Spec: $SPEC"
  echo "Port: $PORT"
  echo "================================================================"
  echo
} >>"$REPORT"

# --- Preconditions -----------------------------------------------------------
if [ ! -x "$PRISM_BIN" ]; then
  echo "ERROR: $PRISM_BIN not found. Run 'npm install' in $API_DIR first." >&2
  echo "SPIKE ABORTED: dependencies not installed" >>"$REPORT"
  exit 2
fi

# --- Q1: Redocly lint --------------------------------------------------------
echo "--- Q1: Redocly lint ---" >>"$REPORT"
if [ -x "$REDOCLY_BIN" ]; then
  lint_out="$(cd "$API_DIR" && "$REDOCLY_BIN" lint --config redocly.yaml "$SPEC" 2>&1)"
  lint_rc=$?
  printf '%s\n\n' "$lint_out" >>"$REPORT"
  if [ $lint_rc -eq 0 ]; then
    record PASS "Q1 Redocly lint" "exit code 0"
  else
    record FAIL "Q1 Redocly lint" "exit code $lint_rc — see output above"
  fi
else
  record FAIL "Q1 Redocly lint" "redocly binary not installed"
fi

# --- Start Prism -------------------------------------------------------------
echo "--- Q2: Prism starts and serves ---" >>"$REPORT"
"$PRISM_BIN" mock "$SPEC" --host 127.0.0.1 --port "$PORT" --errors >"$PRISM_LOG" 2>&1 &
prism_pid=$!

ready=0
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "$BASE/services" 2>/dev/null; then ready=1; break; fi
  sleep 0.5
done

if [ $ready -ne 1 ]; then
  record FAIL "Q2 Prism startup" "mock did not become ready within 20s; see prism.log"
  echo "SPIKE ABORTED: prism did not start" >>"$REPORT"
  exit 3
fi

code="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/services")"
body="$(curl -sS "$BASE/services")"
if [ "$code" = "200" ] && printf '%s' "$body" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
  record PASS "Q2 Prism startup" "GET /services -> 200 with a non-empty array (paths mounted at the root, no /api/v1 prefix)"
else
  record FAIL "Q2 Prism startup" "GET /services -> $code; body: $(printf '%s' "$body" | head -c 200)"
fi

# --- Q3: forced 409 via Prefer ----------------------------------------------
echo "--- Q3: Prefer: code=409 ---" >>"$REPORT"
valid_body='{"masterId":"44444444-4444-4444-8444-444444444444","serviceIds":["55555555-5555-4555-8555-555555555555"],"startsAt":"2026-10-01T14:00:00+03:00","client":{"name":"Iryna","phone":"+380501234567"}}'

# 3a: default (documented 201)
c201="$(curl -sS -o /tmp/spike201.json -w '%{http_code}' -X POST "$BASE/appointments" \
  -H 'Content-Type: application/json' -d "$valid_body")"
b201="$(cat /tmp/spike201.json)"
if [ "$c201" = "201" ] && printf '%s' "$b201" | jq -e '.status == "confirmed"' >/dev/null 2>&1; then
  record PASS "Q3a default POST" "POST /appointments -> 201 with status=confirmed"
else
  record FAIL "Q3a default POST" "POST /appointments -> $c201; body: $(printf '%s' "$b201" | head -c 200)"
fi

# 3b: forced 409
c409="$(curl -sS -o /tmp/spike409.json -w '%{http_code}' -X POST "$BASE/appointments" \
  -H 'Content-Type: application/json' -H 'Prefer: code=409' -d "$valid_body")"
b409="$(cat /tmp/spike409.json)"
if [ "$c409" = "409" ]; then
  if printf '%s' "$b409" | jq -e '.code == "SLOT_UNAVAILABLE"' >/dev/null 2>&1; then
    record PASS "Q3b forced 409" "Prefer: code=409 -> 409 with documented code=SLOT_UNAVAILABLE"
  else
    record FAIL "Q3b forced 409" "409 returned but body is not the documented Problem: $(printf '%s' "$b409" | head -c 300)"
  fi
else
  record FAIL "Q3b forced 409" "Prefer: code=409 -> $c409 (documented response not honoured); body: $(printf '%s' "$b409" | head -c 300)"
fi

# --- Q4: schema-invalid body -------------------------------------------------
echo "--- Q4: invalid request body ---" >>"$REPORT"
bad_body='{"masterId":"not-a-uuid","serviceIds":[],"startsAt":"yesterday","client":{"name":""}}'
c422="$(curl -sS -o /tmp/spike422.json -w '%{http_code}' -X POST "$BASE/appointments" \
  -H 'Content-Type: application/json' -d "$bad_body")"
b422="$(cat /tmp/spike422.json)"
printf 'status=%s\nbody=%s\n\n' "$c422" "$(printf '%s' "$b422" | head -c 500)" >>"$REPORT"
if [ "$c422" = "422" ] || [ "$c422" = "400" ]; then
  if printf '%s' "$b422" | jq -e '.code' >/dev/null 2>&1; then
    record PASS "Q4 invalid body" "$c422 returned with our Problem shape (has .code)"
  else
    record FAIL "Q4 invalid body" "$c422 returned, but body lacks our .code field — Prism uses its own error format"
  fi
else
  record FAIL "Q4 invalid body" "unexpected status $c422"
fi

# --- Summary -----------------------------------------------------------------
{
  echo "================================================================"
  echo "PASS: $pass   FAIL: $fail"
  echo
  echo "Interpretation:"
  echo "  Q1/Q2 PASS  -> Redocly lint and Prism mock are usable; gate criterion 8/9 achievable."
  echo "  Q3  PASS    -> business-rule 4xx responses can be demonstrated through the mock"
  echo "                 (gate criterion 10 satisfiable for those negatives)."
  echo "  Q3  FAIL    -> forced 4xx is not honoured; negative scenarios must be asserted"
  echo "                 against the documented examples, and the limitation recorded"
  echo "                 in spec/api/clarifications.md."
  echo "  Q4  FAIL    -> Prism's own validation body does not match our Problem schema;"
  echo "                 schema-validation negatives cannot claim Problem fidelity."
} >>"$REPORT"

cat "$REPORT"
[ $fail -eq 0 ] || exit 1
