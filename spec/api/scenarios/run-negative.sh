#!/usr/bin/env bash
# Negative scenarios for the Salon Management System mock API.
# Requires: curl, jq, and a running Prism mock (npm run mock).
# Usage: ./run-negative.sh [base-url]
set -u

BASE="${1:-${BASE:-http://127.0.0.1:4010}}"
TOKEN="${TOKEN:-test-token}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="$HERE/results"
mkdir -p "$RESULTS"
REPORT="$RESULTS/negative-results.txt"
: > "$REPORT"

PASS=0
FAIL=0
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

EXTRA=()
CTYPE=application/json
STATUS=""
RESP_CT=""
BODY=""

log() { printf '%s\n' "$1" | tee -a "$REPORT"; }

check() { # id description expected actual
  if [ "$3" = "$4" ]; then
    PASS=$((PASS + 1))
    log "PASS  $1  $2"
  else
    FAIL=$((FAIL + 1))
    log "FAIL  $1  $2 (expected [$3], got [$4])"
  fi
}

http() { # method path [body]
  local method="$1" path="$2" data="${3:-}" out
  local args=(-s --max-time 15 -o "$TMP" -w '%{http_code}|%{content_type}' -X "$method" "$BASE$path")
  if [ "${#EXTRA[@]}" -gt 0 ]; then args+=("${EXTRA[@]}"); fi
  if [ -n "$data" ]; then args+=(-H "Content-Type: $CTYPE" -d "$data"); fi
  out="$(curl "${args[@]}")"
  STATUS="${out%%|*}"
  RESP_CT="${out#*|}"
  BODY="$(cat "$TMP")"
}

j() { printf '%s' "$BODY" | jq -r "$1"; }
is_problem() { case "$RESP_CT" in *problem+json*) echo true ;; *) echo false ;; esac; }

SVC1=1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f
SVC2=5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d
MASTER=2f7c1e4a-3d4f-4b6b-8e21-7c5a9d0b3f14
ATOKEN=9b2f7c1e-4a3d-4f6b-8e21-7c5a9d0b3f14
APPT=7c1e4a3d-4f6b-4e21-8c5a-9d0b3f141a2b
MATERIAL=4f4882d2-d6d3-4d89-8e53-2ca647db9298

BOOKING="{\"client\":{\"name\":\"Iryna Kovalenko\",\"phone\":\"+380501234567\"},\"masterId\":\"$MASTER\",\"serviceIds\":[\"$SVC1\",\"$SVC2\"],\"startAt\":\"2026-11-03T10:00:00+02:00\"}"
BAD_EXTRA="{\"client\":{\"name\":\"Iryna Kovalenko\",\"phone\":\"+380501234567\"},\"masterId\":\"$MASTER\",\"serviceIds\":[\"$SVC1\"],\"startAt\":\"2026-11-03T10:00:00+02:00\",\"surprise\":1}"

log "== Negative scenarios against $BASE =="

# NEG-01 missing required fields
EXTRA=()
http POST /appointments '{"client":{"name":"Iryna Kovalenko"}}'
check NEG-01 "status 422" 422 "$STATUS"
check NEG-01 "problem media type" true "$(is_problem)"
check NEG-01 "code VALIDATION_ERROR" VALIDATION_ERROR "$(j .code)"
check NEG-01 "field errors present" true "$(j '.errors|length>0')"

# NEG-02 unknown body property (D22)
EXTRA=()
http POST /appointments "$BAD_EXTRA"
check NEG-02 "status 422" 422 "$STATUS"
check NEG-02 "code VALIDATION_ERROR" VALIDATION_ERROR "$(j .code)"

# NEG-03 wrong query type
EXTRA=()
http GET "/services?page=abc"
check NEG-03 "status 400" 400 "$STATUS"
check NEG-03 "problem media type" true "$(is_problem)"
check NEG-03 "code MALFORMED_REQUEST" MALFORMED_REQUEST "$(j .code)"

# NEG-04 missing credentials
EXTRA=()
http GET /admin/masters
check NEG-04 "status 401" 401 "$STATUS"
check NEG-04 "problem media type" true "$(is_problem)"
check NEG-04 "code UNAUTHENTICATED" UNAUTHENTICATED "$(j .code)"

# NEG-05 wrong role
EXTRA=(-H "Authorization: Bearer $TOKEN" -H 'Prefer: code=403')
http GET /admin/masters
check NEG-05 "status 403" 403 "$STATUS"
check NEG-05 "code FORBIDDEN" FORBIDDEN "$(j .code)"

# NEG-06 unknown service
EXTRA=(-H 'Prefer: code=404')
http GET "/services/$SVC1"
check NEG-06 "status 404" 404 "$STATUS"
check NEG-06 "code NOT_FOUND" NOT_FOUND "$(j .code)"

# NEG-07 unknown token
EXTRA=(-H 'Prefer: code=404')
http GET "/appointments/$ATOKEN"
check NEG-07 "status 404" 404 "$STATUS"
check NEG-07 "code NOT_FOUND" NOT_FOUND "$(j .code)"

# NEG-08 slot taken
EXTRA=(-H 'Prefer: code=409')
http POST /appointments "$BOOKING"
check NEG-08 "status 409" 409 "$STATUS"
check NEG-08 "code SLOT_UNAVAILABLE" SLOT_UNAVAILABLE "$(j .code)"

# NEG-09 duplicate master
EXTRA=(-H "Authorization: Bearer $TOKEN" -H 'Prefer: code=409')
http POST /admin/masters '{"fullName":"Olena Shevchenko","username":"olena","password":"correct-horse-battery"}'
check NEG-09 "status 409" 409 "$STATUS"
check NEG-09 "code DUPLICATE_RESOURCE" DUPLICATE_RESOURCE "$(j .code)"

# NEG-10 edit a cancelled appointment
EXTRA=(-H "Authorization: Bearer $TOKEN" -H 'Prefer: code=409')
http PATCH "/admin/appointments/$APPT" '{"startAt":"2026-11-04T14:00:00+02:00"}'
check NEG-10 "status 409" 409 "$STATUS"
check NEG-10 "code INVALID_STATE_TRANSITION" INVALID_STATE_TRANSITION "$(j .code)"

# NEG-11 payment before completion
EXTRA=(-H "Authorization: Bearer $TOKEN" -H 'Prefer: code=409')
http POST "/admin/appointments/$APPT/payments" '{"amount":{"amountMinor":85000,"currency":"UAH"},"method":"card"}'
check NEG-11 "status 409" 409 "$STATUS"
check NEG-11 "code APPOINTMENT_NOT_COMPLETED" APPOINTMENT_NOT_COMPLETED "$(j .code)"

# NEG-12 overstock issue
EXTRA=(-H "Authorization: Bearer $TOKEN" -H 'Prefer: code=409')
http POST "/admin/materials/$MATERIAL/transactions" '{"type":"issue","quantity":250,"occurredAt":"2026-11-03T11:40:00+02:00"}'
check NEG-12 "status 409" 409 "$STATUS"
check NEG-12 "code MATERIAL_STOCK_INSUFFICIENT" MATERIAL_STOCK_INSUFFICIENT "$(j .code)"

# NEG-13 invalid report period
EXTRA=(-H "Authorization: Bearer $TOKEN" -H 'Prefer: code=422')
http GET "/admin/reports/revenue?period=month&from=2026-10-01&to=2026-10-31"
check NEG-13 "status 422" 422 "$STATUS"
check NEG-13 "code INVALID_PERIOD" INVALID_PERIOD "$(j .code)"

# NEG-14 business rule violation
EXTRA=(-H 'Prefer: code=422')
http GET "/masters/$MASTER/availability?date=2026-11-03&serviceIds=$SVC1"
check NEG-14 "status 422" 422 "$STATUS"
check NEG-14 "code BUSINESS_RULE_VIOLATION" BUSINESS_RULE_VIOLATION "$(j .code)"

# NEG-15 unsupported media type
EXTRA=()
CTYPE=text/plain
http POST /appointments "nope"
CTYPE=application/json
check NEG-15 "status 415" 415 "$STATUS"
check NEG-15 "problem media type" true "$(is_problem)"
check NEG-15 "code UNSUPPORTED_MEDIA_TYPE" UNSUPPORTED_MEDIA_TYPE "$(j .code)"

# NEG-16 unsupported method (mock gap: Prism own error body)
EXTRA=()
http DELETE "/admin/services/$SVC1"
check NEG-16 "status 405" 405 "$STATUS"
log "NOTE  NEG-16 body is Prism's own error object, not Problem (documented gap)"

# NEG-17 documented 405 shape via Prefer
EXTRA=(-H "Authorization: Bearer $TOKEN" -H 'Prefer: code=405')
http PATCH "/admin/services/$SVC1" '{"active":false}'
check NEG-17 "status 405" 405 "$STATUS"
check NEG-17 "problem media type" true "$(is_problem)"
check NEG-17 "code METHOD_NOT_ALLOWED" METHOD_NOT_ALLOWED "$(j .code)"

log ""
log "== Summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
