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
npm install                   # dependencies are installed manually, not by an agent
npm run build                 # contract → validators → tsc → dist/
npm start                     # http://localhost:3000/health
```

The process needs `DATABASE_URL`, `JWT_SECRET` and (for tests)
`TEST_DATABASE_URL`. `.env` is loaded by the npm scripts; a direct
`node dist/src/index.js` has to carry the variables itself.

Migrations run from `src/db/migrations/` through the project's own runner; the
test suite applies them to the test database before it starts.

## Tests

```bash
npm test                                  # the full suite (needs TEST_DATABASE_URL)
npx vitest run --sequence.shuffle         # order-independence
npm run check:test-first                  # every test commit precedes its implementation
```

`TEST_DATABASE_URL` must name a database whose name ends in `_test`: the suite
truncates it before each file (decision D-7), so it must not hold anything worth
keeping.

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
