# Salon Management System — API

A REST API for a single salon: masters, services, a booking calendar, reminders,
consumables and the three reports an administrator needs. It is built
contract-first — `spec/api/openapi.yaml` is the approved artifact, and the tests
are derived from it, not from the code.

| | |
|---|---|
| Contract | 50 operations, 58 schemas, 16 error codes, RFC 9457 problems |
| Runtime | Node.js ≥ 24.18, TypeScript (ESM, `NodeNext`), Express 5 |
| Storage | PostgreSQL 16, Drizzle ORM, migrations 0000–0008 |
| Tests | Vitest 4, Supertest, AJV validators generated from the contract — **395 cases in 24 files** |
| Evidence | one signed gate per stage in `logs/gates/`, one control run per stage in `logs/runs/` |

## Quick start

```bash
cp .env.example .env          # then edit the values you need
docker compose up -d postgres # the development database
docker compose exec postgres createdb -U salon salon_test   # the test database
npm install                   # dependencies are installed manually, not by an agent
npx drizzle-kit migrate       # applies src/db/migrations to DATABASE_URL
npm run build                 # contract → validators → tsc → dist/
npm start                     # http://localhost:3000/health
```

The order matters: `npm run build` writes both `dist/` and the derived
`src/contract/openapi.json`, and `npm start` runs `dist/src/index.js`, so
starting before building has nothing to run.

The process needs `DATABASE_URL`, `JWT_SECRET` and (for tests)
`TEST_DATABASE_URL`. `.env` is loaded by the npm scripts; a direct
`node dist/src/index.js` has to carry the variables itself.

`npx drizzle-kit migrate` applies the committed SQL in `src/db/migrations/` to
the database named by `DATABASE_URL` (`drizzle.config.ts`). The test suite
migrates `TEST_DATABASE_URL` itself, from the same folder, before every run.

## First run, step by step

| # | Command | What you should see |
|---|---|---|
| 1 | `docker compose up -d postgres` | `docker compose ps` reports the container `healthy` |
| 2 | `docker compose exec postgres createdb -U salon salon_test` | no output; `docker compose exec postgres psql -U salon -l` lists `salon_test` |
| 3 | `npx drizzle-kit migrate` | the journal from `0000` to `0008`, no error |
| 4 | `npm run build` | `dist/src/index.js` exists |
| 5 | `npm start` | `curl -s localhost:3000/health` answers `200` |
| 6 | `POST /api/v1/auth/login` | `200` and a token, once the administrator below exists |

Health sits outside the versioned surface: `/health`, not `/api/v1/health`.

## The first administrator

No migration seeds an account — the only data a migration inserts is the three
service categories (`0001`). `POST /admin/masters` creates `master` accounts and
is itself an administrator operation, so the first administrator is written by
hand.

A password is stored as `scrypt$N$r$p$salt$key` (D-18). Generate the hash with
the built code:

```bash
node --input-type=module -e "import { hashPassword } from './dist/src/modules/auth/password.js'; console.log(hashPassword(process.argv[1]))" 'change-me'
```

It prints one line; paste it in place of `<hash>`:

```bash
docker compose exec postgres psql -U salon -d salon -c "INSERT INTO masters (full_name, username, password_hash, role, active) VALUES ('Administrator', 'admin', '<hash>', 'admin', true);"
```

The credentials above are placeholders. Generate your own hash and do not commit
a real one: a committed hash is a password with extra steps.

```bash
curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d '{"username":"admin","password":"change-me"}'
```

The token lives for `JWT_EXPIRES_IN` seconds (one hour by default), so a `401`
after a while means logging in again, not a broken account.

## Tests

```bash
npm test                                  # the full suite (needs TEST_DATABASE_URL)
npx vitest run --sequence.shuffle         # order-independence
npm run check:test-first                  # every test commit precedes its implementation
```

`TEST_DATABASE_URL` must name a database whose name ends in `_test`: the suite
truncates it before each file (decision D-7), so it must not hold anything worth
keeping. Create it once with step 2 of the quick start and the suite will
migrate it itself.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `Missing required environment variable: DATABASE_URL` | no `.env` | `cp .env.example .env` |
| `database "salon_test" does not exist` | the test database was never created | step 2 above |
| `database "salon_test" already exists` | it was created earlier | skip step 2 |
| `… the name must end in _test (decision D-7)` | `TEST_DATABASE_URL` names the wrong database | point it at a `_test` database |
| `ECONNREFUSED 127.0.0.1:5432` | the container is not up yet | `docker compose ps`, then `up -d postgres` |
| `Cannot find module …/dist/src/index.js` | `npm start` before `npm run build` | step 4 above |
| `401` on every authenticated call | the token expired | log in again |

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
| `spec/api/` | the contract, its lint configuration, error model, resource model, traceability |
| `spec/` | the SRS (v1.3 and earlier), the addendum, the task description |
| `src/` | the implementation — see `docs/components.md` for the component split |
| `src/db/migrations/` | schema history, one directory step per stage |
| `tests/api/` | one file per component, named after the operations it covers |
| `tests/acceptance/` | the NFR evidence |
| `scripts/` | contract conversion, contract verification, the test-first check |
| `logs/gates/` | signed gate records (spec, test, exit, refactor) |
| `logs/runs/` | control-run records, each quoting the artifact's own output |
| `logs/runtime/` | control-run scripts and the JSONL log (git-ignored) |
| `logs/samples/` | a committed JSONL sample with an explanation of every field |
| `docs/` | ticket list, commit convention, components, issue import |

## Documentation

| Document | Purpose |
|---|---|
| `spec/api/openapi.yaml` | the contract |
| `spec/api/api-traceability.md` | every requirement → operation → test → control run |
| `spec/api/error-model.md` | the error codes, their triggers and the state table |
| `spec/api/resource-model.md` | the resources and their operations |
| `spec/addenda/001-cancelled-reminders.md` | addendum 001 (REQ-F-034) |
| `docs/components.md` | the component split and the reason for each boundary |
| `docs/ticket-list.md` | every ticket with its status and dependencies |
| `logs/samples/README.md` | the log format, field by field |
| `logs/2026-11-08-implementation-plan.md` | the plan the stages follow |
| `CLAUDE.md` | the working agreement for the coding agent |

## How the work is reviewed

Every stage lands as `test:` (the cases, red) → `gate:` (a signed record stating
what will be verified) → `feat:` (the implementation) → `docs:` (the record), and
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
- **No interface.** This repository is the API; the UI tickets (SMS-36, SMS-37)
  are outside it.
