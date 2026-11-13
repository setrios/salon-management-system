# Validation checklist — SCN-01 … SCN-15 (SMS-48)

| | |
|---|---|
| Prepared for | SMS-48 — the human validation record (plan §10) |
| Prepared by | coding agent, 2026-11-13 |
| Status | **checklist only — the validation has not been executed** |
| Record to fill | `logs/validation/record-template.md` → copy to `logs/validation/YYYY-MM-DD-human-validation.md` |
| Artifact | the built application (`npm run build && npm start`), not the TypeScript sources |

This is preparation, not a result. The shared fixture, **SCN-01, SCN-02, SCN-07,
SCN-10, SCN-12, SCN-14, SCN-15** and the M6 toggle were executed once against a
scratch database on the built artifact (`2026-11-13`), so their commands and
expected values are observed rather than predicted. **SCN-03, SCN-04, SCN-05,
SCN-06's R24 step, SCN-08, SCN-09, SCN-11, SCN-13** are written from the shapes
those calls already have (and from the automated cases named under each); the
validator runs all fifteen regardless. The *verdict* is the validator's in every
case.

---

## 0. Before you start

```bash
cp .env.example .env          # DATABASE_URL, JWT_SECRET, PORT
npm run build                 # contract → validators → tsc → dist/
npx drizzle-kit migrate       # or start the API once: it has no schema otherwise
npm start                     # http://localhost:3000/health
```

In a second terminal:

```bash
node --env-file-if-exists=.env logs/validation/bootstrap.mjs
```

That script creates the two accounts every scenario uses (`admin-val`,
`master-val`, password `validation-password-2026`) and prints the login commands.
It refuses a database whose name ends in `_test`, and it does nothing if the
accounts already exist.

Then, in the same terminal:

```bash
B=http://localhost:3000/api/v1
tok() { node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken'; }
ADMIN=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin-val","password":"validation-password-2026"}' | tok)
MASTER=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"master-val","password":"validation-password-2026"}' | tok)
MASTER_ID=$(curl -s "$B/admin/masters" -H "Authorization: Bearer $ADMIN" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.find(m=>m.username==="master-val").id')
```

**The shared fixture** (services, links, a Monday window) — one block, used by
most scenarios:

```bash
mk_service() { # name, minutes → id on stdout
  curl -s -X POST "$B/admin/services" -H "Authorization: Bearer $ADMIN" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"category\":\"Validation\",\"baseDurationMinutes\":$2}" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id'
}
link() { # service id
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/admin/master-services" \
    -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
    -d "{\"masterId\":\"$MASTER_ID\",\"serviceId\":\"$1\",\"price\":{\"amountMinor\":40000,\"currency\":\"UAH\"}}"
}
HAIRCUT=$(mk_service 'Validation Haircut' 30)
COLOUR=$(mk_service 'Validation Colouring' 50)
link "$HAIRCUT"; link "$COLOUR"          # each prints 201

curl -s -o /dev/null -w 'availability %{http_code}\n' -X PUT "$B/me/availability" \
  -H "Authorization: Bearer $MASTER" -H 'Content-Type: application/json' \
  -d '{"weekly":[{"dayOfWeek":1,"startTime":"10:00","endTime":"18:00"}],"dates":[]}'
```

All slots below are **Mondays** (`2026-11-16`, `2026-11-23`, `2026-11-30`) and
carry the Kyiv offset. A start that is not on a 30-minute boundary is refused
with 422 — that is SCN-13's own rule, not a defect.

---

## 1. The scenarios

Each entry states the intent it exercises (from `spec/DESCRIPTION.md` §2 and the
SRS), the commands, the expected result, and where the same behaviour is already
covered automatically. The automated evidence is a pointer, not a substitute: run
the commands.

### SCN-01 — Successful multi-service booking

*Intent: a client books several services in one visit; duration and cost are summed.*

```bash
BOOK=$(curl -s -X POST "$B/appointments" -H 'Content-Type: application/json' \
  -d "{\"client\":{\"name\":\"Validation Client\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER_ID\",\"serviceIds\":[\"$HAIRCUT\",\"$COLOUR\"],\"startAt\":\"2026-11-16T10:00:00+02:00\"}")
echo "$BOOK" | node -pe 'const b=JSON.parse(require("fs").readFileSync(0,"utf8"));JSON.stringify({status:b.status,duration:b.totalDurationMinutes,occupied:b.occupiedDurationMinutes,end:b.endAt,price:b.totalPrice,reminders:b.reminders.map(r=>r.status),url:!!b.confirmationUrl})'
TOKEN=$(echo "$BOOK" | tok)
```

**Expect:** HTTP 201; `status: "confirmed"`; two `services` entries; `totalDurationMinutes: 80` (30+50); `price.amountMinor: 80000`; two `reminders`, both `scheduled`; a `confirmationUrl`.

**Also:** `GET $B/appointments/$TOKEN` returns the same record — that is the confirmation page (P9).

*Automated:* `tests/api/booking.test.ts` (P8), `confirmation.test.ts` (P9).

### SCN-02 — Free cancellation, no restriction

*Intent: cancellation is always free, with no deadline.*

```bash
curl -s -o /dev/null -w 'cancel %{http_code}\n' -X POST "$B/appointments/$TOKEN/cancel"
curl -s -o /dev/null -w 'cancel again %{http_code}\n' -X POST "$B/appointments/$TOKEN/cancel"
```

**Expect:** `200` both times; the record's `status` is `cancelled` after the
first, and a second call returns the *same* record (no 409, no new `updatedAt`).

*Automated:* `tests/api/cancellation.test.ts` (K1–K8).

### SCN-03 — Free reschedule with reminder recalculation

*Intent: rescheduling is free, unlimited, and the reminders follow the new time.*

SCN-02 cancels SCN-01's record, so this scenario books its own (a cancelled
record cannot be rescheduled — that is a 409, and it is not what this case is
about):

```bash
R3=$(curl -s -X POST "$B/appointments" -H 'Content-Type: application/json' \
  -d "{\"client\":{\"name\":\"Validation Client\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER_ID\",\"serviceIds\":[\"$HAIRCUT\"],\"startAt\":\"2026-11-16T14:00:00+02:00\"}")
R3_TOKEN=$(echo "$R3" | tok)
curl -s -X POST "$B/appointments/$R3_TOKEN/reschedule" -H 'Content-Type: application/json' \
  -d '{"startAt":"2026-11-16T15:00:00+02:00"}' \
  | node -pe 'const b=JSON.parse(require("fs").readFileSync(0,"utf8"));JSON.stringify({id:b.id,start:b.startAt,end:b.endAt,reminders:b.reminders.map(r=>r.scheduledAt)})'
```

**Expect:** `200`; same `id` and token; `startAt` moved; both `scheduledAt` values moved by the same amount as the start.

*Automated:* `tests/api/reschedule.test.ts`; `reminders.test.ts` R7/R8.

### SCN-04 — 24-hour reminder skipped for a late booking

*Intent: a booking made less than a day ahead does not pretend a 24-hour reminder happened.*

```bash
LATE=$(curl -s -X POST "$B/appointments" -H 'Content-Type: application/json' \
  -d "{\"client\":{\"name\":\"Validation Client\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER_ID\",\"serviceIds\":[\"$HAIRCUT\"],\"startAt\":\"2026-11-16T13:00:00+02:00\"}")
echo "$LATE" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).reminders'
```

For the 24-hour moment to be in the past, the slot must be **less than 24 hours
ahead**. Open a window for tomorrow first, then book inside it:

```bash
TOMORROW=$(date -d tomorrow '+%Y-%m-%d')
curl -s -o /dev/null -w 'window %{http_code}\n' -X PUT "$B/me/availability" \
  -H "Authorization: Bearer $MASTER" -H 'Content-Type: application/json' \
  -d "{\"weekly\":[{\"dayOfWeek\":1,\"startTime\":\"10:00\",\"endTime\":\"18:00\"}],
       \"dates\":[{\"date\":\"$TOMORROW\",\"startTime\":\"10:00\",\"endTime\":\"18:00\"}]}"
LATE=$(curl -s -X POST "$B/appointments" -H 'Content-Type: application/json' \
  -d "{\"client\":{\"name\":\"Validation Client\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER_ID\",\"serviceIds\":[\"$HAIRCUT\"],\"startAt\":\"${TOMORROW}T10:00:00+02:00\"}")
echo "$LATE" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).reminders'
```

**Expect:** the `24h` reminder `skipped`, the `2h` one `scheduled` — *provided the
run happens after 10:00 today*. If it is earlier than that, the 24-hour moment is
still ahead and both will be `scheduled`: in that case note `NOT EXECUTED (clock)`
rather than calling it a failure.

*Automated:* `tests/api/reminders.test.ts` R2.

### SCN-05 — Both reminders skipped for a very late booking

*Intent: same rule, two hours.*

A slot less than two hours ahead, in a window opened for the next half hour:

```bash
SOON=$(date -d '+1 hour' '+%Y-%m-%dT%H:00:00+02:00')
SOON_DAY=$(date -d '+1 hour' '+%Y-%m-%d')
SOON_END=$(date -d '+2 hours' '+%H:00')
curl -s -o /dev/null -w 'window %{http_code}\n' -X PUT "$B/me/availability" \
  -H "Authorization: Bearer $MASTER" -H 'Content-Type: application/json' \
  -d "{\"weekly\":[],\"dates\":[{\"date\":\"$SOON_DAY\",\"startTime\":\"${SOON:11:5}\",\"endTime\":\"$SOON_END\"}]}"
VERY_LATE=$(curl -s -X POST "$B/appointments" -H 'Content-Type: application/json' \
  -d "{\"client\":{\"name\":\"Validation Client\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER_ID\",\"serviceIds\":[\"$HAIRCUT\"],\"startAt\":\"$SOON\"}")
echo "$VERY_LATE" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).reminders'
```

**Expect:** both `skipped`. If the hour is such that no slot is possible (for
example after 23:00), note `NOT EXECUTED (clock)` and restore the fixture instead
of forcing it.

**Restore the fixture** before the next scenario:

```bash
curl -s -o /dev/null -w 'restore %{http_code}\n' -X PUT "$B/me/availability" \
  -H "Authorization: Bearer $MASTER" -H 'Content-Type: application/json' \
  -d '{"weekly":[{"dayOfWeek":1,"startTime":"10:00","endTime":"18:00"}],"dates":[]}'
```

*Automated:* `tests/api/reminders.test.ts` R3.

### SCN-06 — Master disables SMS but keeps in-app notifications

*Intent: each master configures their own channels; one channel off does not silence the other.*

```bash
curl -s -o /dev/null -w 'toggle %{http_code}\n' -X PATCH "$B/me/notification-preferences" \
  -H "Authorization: Bearer $MASTER" -H 'Content-Type: application/json' \
  -d '{"channel":"sms","eventType":"new","enabled":false}'
curl -s "$B/me/notification-preferences" -H "Authorization: Bearer $MASTER"
```

**Expect:** `200`; the list shows that combination `enabled: false`, the other
combinations `true`. Then book a new appointment (SCN-01 block) and read R24:
the master's `new` row is `in_app` and `sent`; there is no master `sms` row for it.

*Automated:* `tests/api/notification-preferences.test.ts`; `notification.test.ts` SCN-06.

### SCN-07 — Payment recorded only after service completion

*Intent: money is recorded against a completed visit, once.*

```bash
ID=$(curl -s -X POST "$B/admin/appointments" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"client\":{\"name\":\"Validation Client\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER_ID\",\"serviceIds\":[\"$HAIRCUT\"],\"startAt\":\"2026-11-30T10:00:00+02:00\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
pay() { curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/admin/appointments/$ID/payments" \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"amount":{"amountMinor":40000,"currency":"UAH"},"method":"cash"}'; }
pay                                                  # 409 APPOINTMENT_NOT_COMPLETED
curl -s -o /dev/null -w 'complete %{http_code}\n' -X POST "$B/admin/appointments/$ID/complete" -H "Authorization: Bearer $ADMIN"
pay                                                  # 201
pay                                                  # 409 PAYMENT_ALREADY_RECORDED
```

**Expect:** exactly that sequence. The `Problem.body.code` of the two refusals is
`APPOINTMENT_NOT_COMPLETED` and `PAYMENT_ALREADY_RECORDED`.

*Automated:* `tests/api/appointment-payments.test.ts` P1–P10.

### SCN-08 — Administrator creates a service with a custom category

*Intent: the catalogue is the administrator's, and a category is free text, not a fixed list.*

```bash
curl -s -X POST "$B/admin/services" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Validation Manicure","category":"Nails","baseDurationMinutes":60}' | node -pe 'const b=JSON.parse(require("fs").readFileSync(0,"utf8"));JSON.stringify({id:b.id,category:b.category,duration:b.baseDurationMinutes})'
curl -s "$B/categories" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items'
```

**Expect:** `201`; the category appears in `GET /categories` like any other, and
the service is visible in the public catalogue (P1).

*Automated:* `tests/api/reference-data.test.ts`; `public-catalogue.test.ts`.

### SCN-09 — Master combines a weekly pattern with a one-off date

*Intent: a master's schedule is a pattern plus exceptions.*

```bash
curl -s -o /dev/null -w 'put %{http_code}\n' -X PUT "$B/me/availability" \
  -H "Authorization: Bearer $MASTER" -H 'Content-Type: application/json' \
  -d '{"weekly":[{"dayOfWeek":1,"startTime":"10:00","endTime":"18:00"}],
       "dates":[{"date":"2026-11-16","startTime":"12:00","endTime":"16:00"}]}'
curl -s "$B/masters/$MASTER_ID/availability?date=2026-11-16&serviceIds=$HAIRCUT" \
  | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).slots.slice(0,3))'
```

**Expect:** `200`; on `2026-11-16` the slots start at 12:00 and stop at 16:00 (the
date rule replaces the Monday rule for that date). A booking at 10:00 that day is
`409 SLOT_UNAVAILABLE`; at 13:00 it is `201`.

After this scenario the master's schedule is the pattern **plus** the 16 November
override, which makes 10:00 that day unavailable for later scenarios. Restore the
fixture:

```bash
curl -s -o /dev/null -w 'restore %{http_code}\n' -X PUT "$B/me/availability" \
  -H "Authorization: Bearer $MASTER" -H 'Content-Type: application/json' \
  -d '{"weekly":[{"dayOfWeek":1,"startTime":"10:00","endTime":"18:00"}],"dates":[]}'
```

*Automated:* `tests/api/availability.test.ts`; `booking.test.ts` (K2).

### SCN-10 — Revenue report: preset period and custom date range

*Intent: the owner sees takings for a day/week/month or any range, and the two forms agree.*

```bash
curl -s "$B/admin/reports/revenue?period=week" -H "Authorization: Bearer $ADMIN"
curl -s "$B/admin/reports/revenue?from=2026-11-09&to=2026-11-15" -H "Authorization: Bearer $ADMIN"
```

**Expect:** the same `from`/`to` for that week in both answers, the same
`totalAmount` and `byMethod` breakdown; amounts in minor units with `currency:
"UAH"`. Only `paid` payments count (SCN-07's payment is the one from the fixture;
an `unpaid` one would not move the total).

*Automated:* `tests/api/reports.test.ts` R1–R5.

### SCN-11 — Reschedule reactivates a previously skipped reminder

*Intent: a reminder that was skipped for being late comes back if the visit moves far enough ahead.*

Needs a record whose 24-hour reminder is `skipped`; SCN-04 leaves one behind. If
SCN-04 was `NOT EXECUTED`, make one the same way (the SCN-04 block) and use it.

```bash
echo "$LATE" | node -pe 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).reminders.map(r=>r.status))'
curl -s -X POST "$B/appointments/$(echo "$LATE" | tok)/reschedule" -H 'Content-Type: application/json' \
  -d '{"startAt":"2026-11-30T10:00:00+02:00"}' \
  | node -pe 'const b=JSON.parse(require("fs").readFileSync(0,"utf8"));JSON.stringify(b.reminders.map(r=>r.status))'
```

**Expect:** before `["skipped","scheduled"]`, after `["scheduled","scheduled"]` (the
24-hour row is reactivated because the new time is far enough ahead).

*Automated:* `tests/api/reminders.test.ts` R7 (SCN-11).

### SCN-12 — Administrator is not notified about their own action

*Intent: the person who acts does not get a message about their own act; the master still does.*

```bash
curl -s "$B/admin/appointments/$ID/notifications" -H "Authorization: Bearer $ADMIN" \
  | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).items.map(i=>[i.audience,i.eventType,i.status]))'
```

**Expect:** rows for `master` and `client` only — **no `admin` row** for the
appointment the administrator created (and none for the completion).

*Automated:* `tests/api/admin-appointment-actions.test.ts` U2/X1 (R21/R22), `tests/api/cancellation.test.ts` K6 (P10), `tests/api/notification.test.ts` (the booking row's audiences).

### SCN-13 — Multi-service duration rounds up to a 30-minute slot boundary

*Intent: the calendar stays on the half hour even when the services do not sum to it.*

```bash
curl -s -X POST "$B/appointments" -H 'Content-Type: application/json' \
  -d "{\"client\":{\"name\":\"Validation Client\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER_ID\",\"serviceIds\":[\"$HAIRCUT\",\"$COLOUR\"],\"startAt\":\"2026-11-23T10:00:00+02:00\"}" \
  | node -pe 'const b=JSON.parse(require("fs").readFileSync(0,"utf8"));JSON.stringify({total:b.totalDurationMinutes,occupied:b.occupiedDurationMinutes,start:b.startAt,end:b.endAt})'
```

**Expect:** `totalDurationMinutes: 80`, `occupiedDurationMinutes: 90`,
`endAt = startAt + 90 min`. A start at `10:15` is `422 BUSINESS_RULE_VIOLATION`.

*Automated:* `tests/api/rounding.test.ts`; `booking.test.ts`.

### SCN-14 — Popular services report ranks by booking count

*Intent: the owner sees which services are actually booked.*

```bash
curl -s "$B/admin/reports/popular-services?period=month" -H "Authorization: Bearer $ADMIN" \
  | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).items.slice(0,5))'
```

**Expect:** items ordered by `bookingsCount` descending, each with a `rank` and the
service's current catalogue `name`; cancelled appointments count too (the S5.4
decision).

*Automated:* `tests/api/reports.test.ts` R6–R8.

### SCN-15 — Stock levels report is a period-independent snapshot

*Intent: stock is a balance, not a period figure; the report says "as of now".*

```bash
MID=$(curl -s -X POST "$B/admin/materials" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Validation Shampoo","unit":"ml","initialStockQuantity":0}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
curl -s -o /dev/null -w 'receipt %{http_code}\n' -X POST "$B/admin/materials/$MID/transactions" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"type":"receipt","quantity":10,"occurredAt":"2026-11-13T10:00:00+02:00"}'
curl -s -o /dev/null -w 'issue %{http_code}\n'   -X POST "$B/admin/materials/$MID/transactions" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"type":"issue","quantity":3,"occurredAt":"2026-11-13T11:00:00+02:00"}'
curl -s "$B/admin/reports/stock-levels" -H "Authorization: Bearer $ADMIN" \
  | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).items.filter(i=>i.name==="Validation Shampoo"))'
curl -s -o /dev/null -w 'with period %{http_code}\n' "$B/admin/reports/stock-levels?period=week" -H "Authorization: Bearer $ADMIN"
```

**Expect:** `quantity: 7` (10 − 3); the report has an `asOf` instant and no period
fields; a `period` parameter is ignored (`200`, same body) rather than refused.
An `issue` larger than the balance is `409 MATERIAL_STOCK_INSUFFICIENT`.

*Automated:* `tests/api/material-transactions.test.ts`; `reports.test.ts` R9/R10.

---

## 2. What the checklist cannot do

- **It cannot be the validation.** A record that repeats these expected values is
  the automated suite in prose; plan §10 says so explicitly.
- **It cannot assert intent.** Whether SCN-01's booking *feels* like the salon's
  workflow — and whether the addendum was justified — are the validator's
  judgements, recorded in the template's §3 and §4.
- **It does not cover the two UI requirements** (REQ-NF-002/003/004): they are
  SMS-36, outside this repository.

## 3. Known deviation to assess (register row 13)

`P11` and `R21` answer different codes for an edit that collides with an existing
booking (`409` on the client's path, `422` in the administrator's pre-check); both
codes are declared by the contract for both operations. Stage R kept the
behaviour (plan §9 forbids changing it under a refactor label), so the validator
decides whether it is acceptable. The template's §5 pre-lists it.
