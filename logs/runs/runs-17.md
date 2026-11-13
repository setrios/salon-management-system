# Acceptance run — S5.5 NFR checks (SMS-20)

| | |
|---|---|
| Stage | S5.5 — non-functional acceptance |
| Ticket | SMS-20 (Verification) |
| Gate | G4 (SMS-7) |
| Date | 2026-11-13 |
| Artifact | `dist/` — the built output, not the sources |
| Script | `logs/runtime/s55-acceptance-run.mjs` (git-ignored) |
| Result | **17/17 checks passed** |

---

## 1. What was run, and why on the artifact

```
$ npm run build
  schemas:    58
  operations: 50
  copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json

$ node --env-file-if-exists=.env logs/runtime/s55-acceptance-run.mjs
```

The script loads `dist/src/app.js`, calls `createApp()` with no argument (D9) and
drives the application over a socket, exactly as the stage control runs do. That
is deliberate: the plan's §8.3 criterion 3 asks that the last evidence for a gate
be taken against the build, and an NFR is a property of the artifact, not of the
TypeScript that produced it.

The database is a scratch one (`salon_s55_acceptance_test`), created, migrated and
dropped by the run.

The acceptance suite (`tests/acceptance/nfr.test.ts`, 7 cases) covers the same
ground against the sources and runs in `npm test`; this run is the artifact-side
repetition, plus the two scans over `dist/`.

## 2. The checks

```
scratch database created: salon_s55_acceptance_test
PASS  The artifact books an appointment

--- REQ-NF-006: client data ---
PASS  The administrator sees the client’s name and phone
PASS  The administrator’s body carries no access token (D18)
PASS  The owning master sees the appointment with the client’s phone
PASS  Another master’s calendar does not contain it
PASS  The token holder sees their own record
PASS  An unknown token is 404, which says nothing about whether it existed

--- REQ-NF-007: one time zone ---
PASS  Instants on the wire carry the salon offset
PASS  The shipped contract declares no location or time-zone selector

--- REQ-NF-005: nothing deletes itself ---
PASS  No purge job, scheduler or destructive SQL in the built artifact
PASS  No scheduling dependency is installed

--- REQ-NF-009: no payment gateway ---
PASS  No payment-provider dependency is installed
PASS  No outbound HTTP call exists in the built artifact

--- Guards and REQ-NF-008 ---
PASS  An admin operation refuses an anonymous request
PASS  An admin operation refuses a master
PASS  A start time off the 30-minute boundary is refused
PASS  The appointment made at the start of the run is still retrievable

ALL CHECKS PASSED

scratch database dropped: salon_s55_acceptance_test
```

### 2.1 What the checks establish

| NFR | Evidence |
|---|---|
| REQ-NF-006 | the administrator, the owning master and the token holder each receive the client's name and phone; another master's calendar is empty; an unknown token is 404; the administrator's body carries no `accessToken` |
| REQ-NF-007 | `startAt`/`endAt` on the wire are `2026-12-07T10:00:00+02:00` and its half hour; the shipped contract has no location/zone/offset selector |
| REQ-NF-005 | no purge, retention, scheduler, `setInterval`, `delete from`, `truncate` or `drop table` in `dist/`; no scheduling dependency |
| REQ-NF-009 | no payment-provider dependency; no `fetch`/`http.request`/`axios` in `dist/src` outside the contract bundle |
| REQ-NF-008 | `10:15` is refused with 422 `BUSINESS_RULE_VIOLATION` (S2.1's D3) |
| REQ-NF-001 | the record is reachable only through the token handed out at booking, and is still reachable at the end of the run |

Defensive reading of the two absence scans: comments are stripped before matching,
so a doc comment that uses the word "archive" cannot fail the check, and prose
that says "no gateway" cannot pass it.

## 3. The log records

The run writes no request log of its own — it does not use the app's request
logger path that the stage control runs trim, so nothing was trimmed here. The
scans read `dist/`, not `logs/`.

## 4. What the run does not cover

- **REQ-NF-002, REQ-NF-003, REQ-NF-004** — interface properties; they belong to
  SMS-36 and are out of scope for this work (plan §2).
- **REQ-NF-005's "arbitrary elapsed time"** — an absence constraint cannot be
  proven by waiting; the artifact provably contains no purge mechanism, which is
  the checkable form of the requirement.
- **Concurrency and load** — no NFR in the SRS states a throughput or latency
  target, so none is asserted.
