#!/usr/bin/env bash
# Positive scenarios for the Salon Management System mock API.
# Requires: curl, jq, and a running Prism mock (npm run mock).
# Usage: ./run-positive.sh [base-url]
set -u

BASE="${1:-${BASE:-http://127.0.0.1:4010}}"
TOKEN="${TOKEN:-test-token}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="$HERE/results"
mkdir -p "$RESULTS"
REPORT="$RESULTS/positive-results.txt"
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

SVC1=1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f
SVC2=5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d
MASTER=2f7c1e4a-3d4f-4b6b-8e21-7c5a9d0b3f14
ATOKEN=9b2f7c1e-4a3d-4f6b-8e21-7c5a9d0b3f14
APPT=7c1e4a3d-4f6b-4e21-8c5a-9d0b3f141a2b
MATERIAL=4f4882d2-d6d3-4d89-8e53-2ca647db9298

BOOKING="{\"client\":{\"name\":\"Iryna Kovalenko\",\"phone\":\"+380501234567\"},\"masterId\":\"$MASTER\",\"serviceIds\":[\"$SVC1\",\"$SVC2\"],\"startAt\":\"2026-11-03T10:00:00+02:00\"}"

log "== Positive scenarios against $BASE =="

# POS-01 multi-service booking
EXTRA=()
http POST /appointments "$BOOKING"
check POS-01 "status 201" 201 "$STATUS"
check POS-01 "status confirmed" confirmed "$(j .status)"
check POS-01 "two service lines" 2 "$(j '.services|length')"
check POS-01 "total duration 75" 75 "$(j .totalDurationMinutes)"
check POS-01 "occupied duration 90" 90 "$(j .occupiedDurationMinutes)"
check POS-01 "total price 85000" 85000 "$(j .totalPrice.amountMinor)"
check POS-01 "currency UAH" UAH "$(j .totalPrice.currency)"
check POS-01 "media type json" application/json "$RESP_CT"
check POS-01 "token is UUID" true "$(j '.accessToken|test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")')"
check POS-01 "confirmation URL is https" true "$(j '.confirmationUrl|startswith("https://")')"
check POS-01 "two reminders" 2 "$(j '.reminders|length')"

# POS-02 cancellation
EXTRA=()
http POST "/appointments/$ATOKEN/cancel"
check POS-02 "status 200" 200 "$STATUS"
check POS-02 "status cancelled" cancelled "$(j .status)"

# POS-03 reschedule
EXTRA=()
http POST "/appointments/$ATOKEN/reschedule" '{"startAt":"2026-11-04T14:00:00+02:00"}'
check POS-03 "status 200" 200 "$STATUS"
check POS-03 "new start applied" "2026-11-04T14:00:00+02:00" "$(j .startAt)"
check POS-03 "24h reminder at new time" "2026-11-03T14:00:00+02:00" "$(j '.reminders[0].scheduledAt')"
check POS-03 "2h reminder at new time" "2026-11-04T12:00:00+02:00" "$(j '.reminders[1].scheduledAt')"

# POS-04 reminder times derive from startAt
EXTRA=()
http POST /appointments "$BOOKING"
check POS-04 "24h reminder 24h before start" true "$(j '.reminders[0].scheduledAt == "2026-11-02T10:00:00+02:00"')"
check POS-04 "reminder types" "24h,2h" "$(j '[.reminders[].type]|join(",")')"

# POS-05 two reminder records
EXTRA=()
http POST /appointments "$BOOKING"
check POS-05 "two reminder records" 2 "$(j '.reminders|length')"
check POS-05 "second reminder is 2h" "2h" "$(j '.reminders[1].type')"

# POS-06 notification preference toggle
EXTRA=(-H "Authorization: Bearer $TOKEN")
http PATCH /me/notification-preferences '{"channel":"sms","eventType":"cancellation","enabled":true}'
check POS-06 "status 200" 200 "$STATUS"
check POS-06 "channel sms" sms "$(j .channel)"
check POS-06 "event cancellation" cancellation "$(j .eventType)"
check POS-06 "enabled" true "$(j .enabled)"
http GET /me/notification-preferences
check POS-06 "three preferences" 3 "$(j 'length')"

# POS-07 completion then payment
EXTRA=(-H "Authorization: Bearer $TOKEN")
http POST "/admin/appointments/$APPT/complete"
check POS-07 "completion 200" 200 "$STATUS"
check POS-07 "status completed" completed "$(j .status)"
http POST "/admin/appointments/$APPT/payments" '{"amount":{"amountMinor":85000,"currency":"UAH"},"method":"card","status":"paid"}'
check POS-07 "payment 201" 201 "$STATUS"
check POS-07 "payment paid" paid "$(j .status)"
check POS-07 "payment card" card "$(j .method)"
check POS-07 "payment amount" 85000 "$(j .amount.amountMinor)"
check POS-07 "payment currency" UAH "$(j .amount.currency)"

# POS-08 custom category
EXTRA=(-H "Authorization: Bearer $TOKEN")
http POST /admin/services '{"name":"Manicure","category":"Nails","baseDurationMinutes":60}'
check POS-08 "status 201" 201 "$STATUS"
check POS-08 "category present" true "$(j '.category != null and (.category|length>0)')"
EXTRA=()
http GET /categories
check POS-08 "three seeds" 3 "$(j 'length')"
check POS-08 "seeds flagged" true "$(j 'all(.[]; .seeded == true)')"

# POS-09 availability round trip
EXTRA=(-H "Authorization: Bearer $TOKEN")
AVAIL='{"weekly":[{"dayOfWeek":1,"startTime":"09:00","endTime":"18:00"}],"dates":[{"date":"2026-11-03","startTime":"10:00","endTime":"14:00"}]}'
http PUT /me/availability "$AVAIL"
check POS-09 "PUT 200" 200 "$STATUS"
check POS-09 "monday rule" 1 "$(j '.weekly[0].dayOfWeek')"
check POS-09 "start 09:00" "09:00" "$(j '.weekly[0].startTime')"
check POS-09 "end 18:00" "18:00" "$(j '.weekly[0].endTime')"
check POS-09 "date override" "2026-11-03" "$(j '.dates[0].date')"

# POS-10 revenue report
EXTRA=(-H "Authorization: Bearer $TOKEN")
http GET "/admin/reports/revenue?period=month"
check POS-10 "status 200" 200 "$STATUS"
check POS-10 "period month" month "$(j .period)"
check POS-10 "currency UAH" UAH "$(j .totalAmount.currency)"
check POS-10 "two methods" 2 "$(j '.byMethod|length')"
check POS-10 "cash and card" "cash,card" "$(j '[.byMethod[].method]|join(",")')"

# POS-11 reschedule keeps reminders scheduled
EXTRA=()
http POST "/appointments/$ATOKEN/reschedule" '{"startAt":"2026-11-04T14:00:00+02:00"}'
check POS-11 "status 200" 200 "$STATUS"
check POS-11 "both reminders scheduled" "scheduled,scheduled" "$(j '[.reminders[].status]|join(",")')"

# POS-12 admin cancellation
EXTRA=(-H "Authorization: Bearer $TOKEN")
http POST "/admin/appointments/$APPT/cancel"
check POS-12 "status 200" 200 "$STATUS"
check POS-12 "status cancelled" cancelled "$(j .status)"

# POS-13 rounding
EXTRA=()
http GET "/masters/$MASTER/availability?date=2026-11-03&serviceIds=$SVC1"
check POS-13 "status 200" 200 "$STATUS"
check POS-13 "total duration 75" 75 "$(j .totalDurationMinutes)"
check POS-13 "occupied 90" 90 "$(j .occupiedDurationMinutes)"
check POS-13 "slot duration 90" 90 "$(j '.slots[0].durationMinutes')"

# POS-14 popular services
EXTRA=(-H "Authorization: Bearer $TOKEN")
http GET "/admin/reports/popular-services?period=month"
check POS-14 "status 200" 200 "$STATUS"
check POS-14 "first rank 1" 1 "$(j '.items[0].rank')"
check POS-14 "first bookings 42" 42 "$(j '.items[0].bookingsCount')"
check POS-14 "ranks ascending" true "$(j '[.items[].rank] == ([.items[].rank]|sort)')"

# POS-15 stock snapshot
EXTRA=(-H "Authorization: Bearer $TOKEN")
http GET /admin/reports/stock-levels
check POS-15 "status 200" 200 "$STATUS"
check POS-15 "asOf present" true "$(j '.asOf != null')"
check POS-15 "quantity numeric" number "$(j '.items[0].quantity|type')"
http GET "/admin/reports/stock-levels?period=month"
check POS-15 "unknown period ignored" 200 "$STATUS"

# POS-16 master creation and login
EXTRA=(-H "Authorization: Bearer $TOKEN")
http POST /admin/masters '{"fullName":"Olena Shevchenko","username":"olena","password":"correct-horse-battery","active":true}'
check POS-16 "create 201" 201 "$STATUS"
check POS-16 "username olena" olena "$(j .username)"
check POS-16 "active" true "$(j .active)"
EXTRA=()
http POST /auth/login '{"username":"olena","password":"correct-horse-battery"}'
check POS-16 "login 200" 200 "$STATUS"
check POS-16 "bearer token" Bearer "$(j .tokenType)"
check POS-16 "role master" master "$(j .role)"
check POS-16 "expires positive" true "$(j '.expiresIn > 0')"

# POS-17 master sees own appointments without token
EXTRA=(-H "Authorization: Bearer $TOKEN")
http GET /me/appointments
check POS-17 "status 200" 200 "$STATUS"
check POS-17 "one appointment" 1 "$(j '.items|length')"
check POS-17 "no accessToken in staff view" false "$(j '.items[0]|has("accessToken")')"

# POS-18 master services
EXTRA=(-H "Authorization: Bearer $TOKEN")
http GET /me/services
check POS-18 "status 200" 200 "$STATUS"
check POS-18 "one link" 1 "$(j 'length')"
check POS-18 "currency UAH" UAH "$(j '.[0].price.currency')"
check POS-18 "master id present" true "$(j '.[0].masterId != null')"

# POS-19 reference data update and no deletion
EXTRA=(-H "Authorization: Bearer $TOKEN")
http POST /admin/services '{"name":"Haircut","category":"Hair","baseDurationMinutes":45}'
check POS-19 "create 201" 201 "$STATUS"
http PATCH "/admin/services/$SVC1" '{"active":false}'
check POS-19 "deactivate 200" 200 "$STATUS"
check POS-19 "active false" false "$(j .active)"
EXTRA=()
http DELETE "/admin/services/$SVC1"
check POS-19 "DELETE returns 405" 405 "$STATUS"

# POS-20 admin appointment edit
EXTRA=(-H "Authorization: Bearer $TOKEN")
http PATCH "/admin/appointments/$APPT" '{"startAt":"2026-11-04T14:00:00+02:00"}'
check POS-20 "status 200" 200 "$STATUS"
check POS-20 "start updated" "2026-11-04T14:00:00+02:00" "$(j .startAt)"
check POS-20 "total numeric" number "$(j '.totalPrice.amountMinor|type')"

# POS-21 stock issue
EXTRA=(-H "Authorization: Bearer $TOKEN")
http POST "/admin/materials/$MATERIAL/transactions" '{"type":"issue","quantity":20,"occurredAt":"2026-11-03T11:40:00+02:00","note":"Haircut service usage"}'
check POS-21 "status 201" 201 "$STATUS"
check POS-21 "type issue" issue "$(j .type)"
check POS-21 "quantity 20" 20 "$(j .quantity)"

# POS-22 custom unit
EXTRA=(-H "Authorization: Bearer $TOKEN")
http POST /admin/materials '{"name":"Shampoo","unit":"ml","initialStockQuantity":180}'
check POS-22 "status 201" 201 "$STATUS"
check POS-22 "unit ml" ml "$(j .unit)"
http GET /admin/units
check POS-22 "five standard units" 5 "$(j '.standard|length')"
check POS-22 "standard contains ml" true "$(j '.standard|index("ml") != null')"

# POS-23 token read
EXTRA=()
http GET "/appointments/$ATOKEN"
check POS-23 "status 200" 200 "$STATUS"
check POS-23 "token echoed" "$ATOKEN" "$(j .accessToken)"
check POS-23 "confirmation URL present" true "$(j '.confirmationUrl|length>0')"

# POS-24 staff view hides client token
EXTRA=(-H "Authorization: Bearer $TOKEN")
http GET "/admin/appointments/$APPT"
check POS-24 "status 200" 200 "$STATUS"
check POS-24 "no accessToken" false "$(j 'has("accessToken")')"
check POS-24 "no confirmationUrl" false "$(j 'has("confirmationUrl")')"

# POS-25 all amounts UAH
EXTRA=(-H "Authorization: Bearer $TOKEN")
http GET "/admin/reports/revenue?period=month"
check POS-25 "total currency UAH" UAH "$(j .totalAmount.currency)"
check POS-25 "breakdown currency UAH" true "$(j 'all(.byMethod[]; .amount.currency == "UAH")')"

# POS-26 availability round trip preserved
EXTRA=(-H "Authorization: Bearer $TOKEN")
http PUT /me/availability "$AVAIL"
check POS-26 "PUT 200" 200 "$STATUS"
http GET /me/availability
check POS-26 "GET 200" 200 "$STATUS"
check POS-26 "weekly preserved" 1 "$(j '.weekly|length')"
check POS-26 "dates preserved" 1 "$(j '.dates|length')"

# POS-27 slots on 30-minute boundaries
EXTRA=()
http GET "/masters/$MASTER/availability?date=2026-11-03&serviceIds=$SVC1"
START="$(j '.slots[0].startAt')"
MIN="${START:14:2}"
check POS-27 "slot minute is 00 or 30" true "$([ "$MIN" = "00" ] || [ "$MIN" = "30" ] && echo true || echo false)"

log ""
log "== Summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
