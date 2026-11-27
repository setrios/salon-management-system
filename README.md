# Salon Management System

A booking and management system for a single salon: a client website for
booking, rescheduling and cancelling; a dashboard for masters (calendar,
services, working hours, notifications) and for the administrator (masters,
services, prices, appointments, payments, materials, reports). One Node process
serves the REST API and the interface. It is built contract-first —
`spec/api/openapi.yaml` is the approved API and `spec/ui/screens.md` the
approved interface — and the tests are derived from them, not from the code.

| | |
|---|---|
| Contract | 50 operations, 58 schemas, 16 error codes, RFC 9457 problems |
| Interface | 19 page routes: client C1–C3, staff S1, M1–M3, N1–N2, A1–A9 |
| Runtime | Node.js ≥ 24.18, TypeScript (ESM), Express 5 |
| Storage | PostgreSQL 16, Drizzle ORM, migrations 0000–0008 |
| Tests | Vitest + Supertest, **418 cases**; Playwright (Chromium), **51 cases** |
| Evidence | signed gate records in `logs/gates/`, one control run per lab 5 stage in `logs/runs/` |

## Requirements

| Tool | Version | Why |
|---|---|---|
| Node.js | 24.18 or later (`engines` in `package.json`) | runs the server and the scripts |
| Docker with Compose v2 | any current | the PostgreSQL 16 container of `docker-compose.yml` |
| A browser | any current | the interface |
| `curl` and `jq` | any current | only for "Checking endpoints with curl" (`jq` pulls ids and tokens out of the answers): `sudo apt install jq`, `sudo dnf install jq`, `sudo pacman -S jq` or `brew install jq` |

Everything else is an npm dependency, installed by `npm ci`.

## Quick start

From a fresh clone, in the project directory:

```bash
cp .env.example .env                    # then set JWT_SECRET to a long random string
npm ci                                  # the exact dependencies of package-lock.json
docker compose up -d --wait postgres    # returns once the database is healthy
npm run db:migrate                      # creates the tables (reads DATABASE_URL from .env)
npm run create-admin -- --username admin --full-name "Administrator"   # asks for a password, 8–128 characters
npm run build                           # contract → validators → server → interface → dist/
npm start                               # http://localhost:3000/
```

Then open **http://localhost:3000/** (the client website) and
**http://localhost:3000/staff/login** (the staff dashboard; sign in as `admin`
with the password you chose). How to use both is in `docs/user-guide.md`.

A random `JWT_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The order matters: the database must be up before the migration, the
migration before the administrator, and the build before `npm start`, which
runs `dist/src/index.js`.

## First run, step by step

| # | Command | What you should see |
|---|---|---|
| 1 | `docker compose up -d --wait postgres` | the command returns once the container is healthy; `docker compose ps` shows `(healthy)` |
| 2 | `npm run db:migrate` | `db:migrate: the database is up to date.` (drizzle-kit's own `[✓] …` line may or may not show, depending on the terminal) |
| 3 | `npm run create-admin -- --username admin --full-name "Administrator"` | `Password for the administrator:` — type 8–128 characters; nothing is shown as you type — then `create-admin: created the administrator "admin" (Administrator).` |
| 4 | `npm run build` | ends with `copy-web: src/web/styles.css -> dist/src/web/assets/styles.css` |
| 5 | `npm start` | `curl -s localhost:3000/health` answers `{"status":"ok"}` |
| 6 | open `http://localhost:3000/staff/login` | sign in as `admin`; the **Appointments** screen opens |

To start again from an empty database, `docker compose down -v` removes the
container and its data; then begin at step 1. (Two clones in directories of
the same name share one Compose project, and so one database.)

Before clients can book, the administrator adds at least one master, one
service and that master's price for it (**Masters**, **Services**, **Prices**),
and the master signs in and sets working hours (**My availability**). Without
working hours no time is offered.

## Configuration

`.env` is read by `npm start`, `npm run create-admin`, `npm run db:migrate` and
the test setup. A variable set in the environment wins over `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | the PostgreSQL database of the server |
| `JWT_SECRET` | `change-me` outside production; required in production | the HS256 key of the staff tokens |
| `JWT_EXPIRES_IN` | `3600` | a staff token's lifetime, seconds |
| `PORT` | `3000` | the HTTP port |
| `PUBLIC_BASE_URL` | `http://localhost:<PORT>` | the origin of the link in the confirmation SMS (`confirmationUrl`); set it when the server is reached under another name |
| `LOG_DIR` | `logs/runtime` | the directory of the JSONL log |
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `TEST_DATABASE_URL` | — | the database of `npm test`; its name must end in `_test` |
| `UI_TEST_DATABASE_URL` | `postgres://salon:salon@127.0.0.1:5432/salon_ui_test` | the database of `npm run test:ui`; its name must end in `_test` |
| `ADMIN_PASSWORD` | — | `create-admin` takes the password from here instead of asking |

## The first administrator

No migration creates an account, and there is one administrator (REQ-F-017),
so the first one is created with a command:

```bash
npm run create-admin -- --username admin --full-name "Administrator"
```

It asks for the password (8–128 characters; nothing is shown as you type,
Backspace works, Ctrl-C cancels), hashes it the way the server does, and
writes the account. It refuses a second administrator and a taken
username. For a non-interactive run, pass the password in the environment:
`ADMIN_PASSWORD='…' npm run create-admin -- --username admin`.

Masters are created by the administrator in the dashboard (**Masters → Add
master**), not with this command.

## Checking endpoints with curl

The examples below run against the server from the quick start, in order, in
one shell. They need `curl` and `jq`, and start from a fresh installation: the
first block creates what they use — a master, a service, a price and working
hours — the way the administrator and the master would in the dashboard (user
guide §5.1). A random suffix keeps the names unique, so the section can be run
again. Each comment states the status the request answers with.

```bash
BASE=http://localhost:3000/api/v1
ADMIN_PASSWORD='the password you gave create-admin'   # replace with your administrator's password
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d "$(jq -n --arg p "$ADMIN_PASSWORD" '{username:"admin",password:$p}')" | jq -r .accessToken)
SUFFIX=$(node -e "console.log(require('node:crypto').randomBytes(3).toString('hex'))")
DATE=$(node -e "console.log(new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))")   # a week ahead
```

The token stops working after `JWT_EXPIRES_IN` seconds (an hour by default).

### What the examples use

```bash
MASTER=$(curl -s -X POST $BASE/admin/masters -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"fullName\":\"Curl Master\",\"username\":\"curl-$SUFFIX\",\"password\":\"curl-master-password\"}" \
  | jq -r .id)                                                              # 201
SERVICE=$(curl -s -X POST $BASE/admin/services -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Curl haircut $SUFFIX\",\"category\":\"Hair\",\"baseDurationMinutes\":30}" \
  | jq -r .id)                                                              # 201
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/admin/master-services \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"masterId\":\"$MASTER\",\"serviceId\":\"$SERVICE\",\"price\":{\"amountMinor\":40000,\"currency\":\"UAH\"}}"   # 201
MASTER_TOKEN=$(curl -s -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d "{\"username\":\"curl-$SUFFIX\",\"password\":\"curl-master-password\"}" | jq -r .accessToken)
curl -s -o /dev/null -w '%{http_code}\n' -X PUT $BASE/me/availability \
  -H "authorization: Bearer $MASTER_TOKEN" -H 'content-type: application/json' \
  -d "{\"weekly\":$(jq -nc '[range(1;8) | {dayOfWeek:., startTime:"09:00", endTime:"18:00"}]'),\"dates\":[]}"   # 200
```

### Authentication

```bash
curl -s $BASE/auth/me -H "authorization: Bearer $TOKEN"        # 200, the role
curl -s -o /dev/null -w '%{http_code}\n' $BASE/auth/me         # 401, no token
```

### Public reads

```bash
curl -s -o /dev/null -w '%{http_code}\n' $BASE/services        # 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/masters         # 200
curl -s $BASE/categories | jq -c '[.[].name]'                   # 200, the three seeds at least
```

An availability read needs a date and the services: it answers the slots that
fit them. The two free slots below drive the lifecycle section, so nothing
depends on a start that happens to be taken.

```bash
SLOTS=$(curl -s "$BASE/masters/$MASTER/availability?date=$DATE&serviceIds=$SERVICE")
echo "$SLOTS" | jq -c '[.slots[] | select(.available)] | length'   # 200, 18 free slots
START=$(echo "$SLOTS" | jq -r '[.slots[] | select(.available)][0].startAt')
LATER=$(echo "$SLOTS" | jq -r '[.slots[] | select(.available)][1].startAt')
```

### The booking lifecycle

```bash
APPOINTMENT=$(curl -s -X POST $BASE/appointments \
  -H 'content-type: application/json' \
  -d "{\"client\":{\"name\":\"curl-example\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER\",\"serviceIds\":[\"$SERVICE\"],\"startAt\":\"$START\"}")
APPT_TOKEN=$(echo "$APPOINTMENT" | jq -r .accessToken)                    # 201
curl -s $BASE/appointments/$APPT_TOKEN | jq -r .status                    # 200, confirmed
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/appointments/$APPT_TOKEN/reschedule \
  -H 'content-type: application/json' -d "{\"startAt\":\"$LATER\"}"     # 200
```

While the record stands at `$LATER`, a second booking at that start is refused
by the slot rule:

```bash
curl -s -X POST $BASE/appointments -H 'content-type: application/json' \
  -d "{\"client\":{\"name\":\"curl-example\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER\",\"serviceIds\":[\"$SERVICE\"],\"startAt\":\"$LATER\"}" \
  | jq -r .code                                            # SLOT_UNAVAILABLE
```

Cancelling is idempotent, so the second call answers the same status and writes
nothing:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/appointments/$APPT_TOKEN/cancel  # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/appointments/$APPT_TOKEN/cancel  # 200, no write
```

### Administrator operations

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/admin/appointments?from=$DATE&to=$DATE" \
  -H "authorization: Bearer $TOKEN"                      # 200
ID=$(curl -s -X POST $BASE/appointments \
  -H 'content-type: application/json' \
  -d "{\"client\":{\"name\":\"curl-example\",\"phone\":\"+380501112233\"},\"masterId\":\"$MASTER\",\"serviceIds\":[\"$SERVICE\"],\"startAt\":\"$LATER\"}" \
  | jq -r .id)                                           # 201
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/admin/appointments/$ID/complete \
  -H "authorization: Bearer $TOKEN"                      # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/admin/appointments/$ID/payments \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"amount":{"amountMinor":40000,"currency":"UAH"},"method":"card"}'   # 201
```

The second payment for the same appointment is refused — one payment per
appointment:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/admin/appointments/$ID/payments \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"amount":{"amountMinor":40000,"currency":"UAH"},"method":"card"}'   # 409
```

### Reports

```bash
curl -s -o /dev/null -w 'revenue: %{http_code}\n' "$BASE/admin/reports/revenue?period=week" -H "authorization: Bearer $TOKEN"            # 200
curl -s -o /dev/null -w 'popular: %{http_code}\n' "$BASE/admin/reports/popular-services?period=week" -H "authorization: Bearer $TOKEN"   # 200
curl -s -o /dev/null -w 'stock: %{http_code}\n' "$BASE/admin/reports/stock-levels" -H "authorization: Bearer $TOKEN"                    # 200
```

### Stock, and the refusals

```bash
MATERIAL=$(curl -s -X POST $BASE/admin/materials -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Curl dye $SUFFIX\",\"unit\":\"ml\",\"initialStockQuantity\":10}" | jq -r .id)   # 201
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/admin/materials/$MATERIAL/transactions \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"type\":\"receipt\",\"quantity\":1,\"occurredAt\":\"${DATE}T10:00:00+02:00\"}"   # 201
curl -s -X POST $BASE/admin/materials/$MATERIAL/transactions \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"type\":\"issue\",\"quantity\":9999,\"occurredAt\":\"${DATE}T10:00:00+02:00\"}" \
  | jq -r .code                                          # MATERIAL_STOCK_INSUFFICIENT
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/appointments \
  -H 'content-type: application/json' -d '{"client":{"name":"x"}}'   # 422
```

These cover the operation families, not all 50 operations: the contract is
`spec/api/openapi.yaml` (and `docs/api/index.html`), and `tests/api/**` proves
each operation against the same server. The requests write rows — the names
`curl-…`, `Curl …` and `curl-example` mark them.

## Tests and checks

```bash
npm test                                  # API and acceptance tests (Vitest, 418)
npx vitest run --sequence.shuffle         # the same, in a random order
npm run test:ui                           # the interface in Chromium (Playwright, 51)
npm run check:test-first                  # every test file was committed before its implementation
npm run lint                              # ESLint: the coding convention (docs/coding-convention.md)
npm run format:check                      # Prettier: the layout
npm run docs                              # rebuilds docs/api and docs/reference
npm run check:traceability                # regenerates spec/traceability-matrix.md and audits it
```

Both test suites need their own database, created once:

```bash
docker compose exec postgres createdb -U salon salon_test       # npm test
docker compose exec postgres createdb -U salon salon_ui_test    # npm run test:ui
npx playwright install --with-deps chromium                     # once, for npm run test:ui
```

Each suite migrates its database itself and empties it before every file
(decision D-7), so a test database must not hold anything worth keeping — which
is why its name must end in `_test`. `npm run test:ui` builds the project and
starts its own server on port 3100; nothing needs to be running.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `DATABASE_URL is not set: put it in .env …` (from `db:migrate`) | no `.env`, or no `DATABASE_URL` in it | `cp .env.example .env` |
| `Missing required environment variable: DATABASE_URL` (from `npm start`) | the same | the same |
| `ECONNREFUSED 127.0.0.1:5432` | the container is not up | `docker compose up -d --wait postgres` |
| `relation "masters" does not exist` in the server's log | the migrations were not applied | `npm run db:migrate` |
| `create-admin: an administrator already exists (…)` | there is one (REQ-F-017) | sign in with that account |
| **Wrong username or password.** for the administrator | the password differs from the one given to `create-admin` | — the account is not lost: remove it (`docker compose exec postgres psql -U salon -d salon -c "DELETE FROM masters WHERE role = 'admin';"`) and run `create-admin` again |
| C1 shows "No free time on this date" for every date | no master has working hours, or none offers all the chosen services | the master sets **My availability**; the administrator checks **Prices** |
| `database "salon_test" does not exist` | the test database was never created | see "Tests and checks" |
| `… the name must end in _test (decision D-7)` | a test database variable names the wrong database | point it at a `_test` database |
| `Cannot find module …/dist/src/index.js` | `npm start` before `npm run build` | `npm run build` |
| `401` on every staff call | the token expired (`JWT_EXPIRES_IN`) | sign in again |

## Contract

```bash
npm run lint:contract      # redocly lint of spec/api/openapi.yaml
npm run convert:contract   # generates src/contract/openapi.json (git-ignored)
npm run verify:contract    # parses the contract and prints its operation count
```

`src/contract/openapi.json` is derived and not committed; `npm run build`
regenerates it.

## Layout

| Path | What lives there |
|---|---|
| `spec/` | the SRS (v1.3 and earlier), the addendum, the concept note |
| `spec/api/` | the contract, its lint configuration, error model, resource model, traceability, clarification register |
| `spec/ui/` | the interface's screen specification |
| `src/` | the server — see `docs/components.md` for the component split |
| `src/web/` | the interface (browser TypeScript, HTML, CSS) |
| `src/db/migrations/` | schema history |
| `tests/api/`, `tests/acceptance/` | the API tests (one file per component) and the NFR evidence |
| `tests/ui/` | the browser tests of the interface |
| `tests/tooling/` | the tests of the first-run tooling (migrations, `create-admin`) |
| `scripts/` | contract conversion and verification, the test-first check, `create-admin` |
| `docs/` | coding convention, components, user guide, ticket list, commit convention |
| `docs/api/`, `docs/reference/` | the generated API and code references (`npm run docs`) |
| `logs/gates/` | signed gate records |
| `logs/runs/` | control-run records of lab 5, each quoting the artifact's own output |
| `logs/lint/` | the lint reports before and after the convention pass |
| `logs/runtime/` | control-run scripts and the JSONL log (git-ignored) |
| `logs/samples/` | a committed JSONL sample with an explanation of every field |

## Documentation

| Document | Purpose |
|---|---|
| `docs/user-guide.md` | how clients, masters and the administrator use the system |
| `docs/api/index.html` | the API reference, generated from the contract |
| `docs/reference/server/`, `docs/reference/web/` | the code reference, generated from the doc comments |
| `docs/components.md` | the component split, the operation of each module, the reason for each boundary |
| `docs/coding-convention.md` | the coding convention and how it is checked |
| `spec/api/openapi.yaml` | the contract |
| `spec/ui/screens.md` | the interface's screens, labels and conventions |
| `spec/traceability-matrix.md` | every requirement → criterion → scenario → ticket → test → code → screen → documentation, generated and audited by `npm run check:traceability` |
| `spec/api/api-traceability.md` | every requirement → operation → test → control run |
| `spec/api/error-model.md` | the error codes, their triggers and the state table |
| `spec/api/resource-model.md` | the resources and their operations |
| `spec/api/clarifications.md` | the clarifications decided after the SRS (CL-01 … CL-14) |
| `spec/addenda/001-cancelled-reminders.md` | addendum 001 (REQ-F-034) |
| `docs/ticket-list.md` | every ticket with its status and dependencies |
| `logs/samples/README.md` | the log format, field by field |
| `CLAUDE.md` | the working agreement for the coding agent |

## How the work is reviewed

Every change lands as `test:` (the cases, red) → `gate:` (a TEST-GATE record the
developer signs) → `feat:` (the implementation) → `docs:` (the record), and
the exit gate for a stage is signed in `logs/gates/`. The commit history is the
change log; `docs/commit-convention.md` is the format.

## Limits, stated rather than implied

- **SMS delivery is simulated.** A `sent` row means "handed to the channel", not
  "delivered to a phone"; there is no gateway (REQ-NF-009).
- **One salon, one time zone.** Kyiv time leaves the API with its offset
  (REQ-NF-007); there is no location selector.
- **Reminders are sent by a process tick** (60 s period) — a reminder due at
  14:00:00 is sent at the first tick at or after it, and the row records that
  instant, not the due one.
- **The `failed` notification status is reserved.** Delivery is simulated, so
  handing a message to the channel cannot fail; no record is ever `failed`
  (clarification CL-13).
- **Dates and times follow the browser.** Date and time fields are the
  browser's own pickers, and times are shown in its hour cycle (`2:30 PM` or
  `14:30`) — always in English, always the salon's clock (UI-GATE U-4 as
  amended by SMS-79). What is sent to the API is the same in every browser,
  and dates shown elsewhere are written `Mon 16 Nov 2026`.
- **The staff dashboard is designed for a desktop width.** The client screens
  are tested on a 375 px phone width (REQ-NF-002); the dashboard works on a
  phone but is not tested there.
