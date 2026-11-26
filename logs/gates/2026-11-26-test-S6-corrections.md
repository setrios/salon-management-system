# TEST-GATE — stage S6 after the first green run: two test corrections and one defect (SMS-57, SMS-71)

| | |
|---|---|
| Stage | S6 — user interface |
| Implementation | `e2fce55` — `feat: add the web interface for clients and staff (SMS-36)` |
| Corrections commit | `3198cc6` — N5 (`tests/acceptance/nfr.test.ts`), M2 (`tests/ui/responsive.spec.ts`) |
| Defect tests commit | `97ab87f` — `tests/api/admin-masters-role.test.ts`, K1–K5 (SMS-71) |
| Date | 2026-11-26 |
| Signed by | setrios |
| Decision | **GO** |

---

## 1. Where the first run stood

With the interface implemented (`e2fce55`):

| Suite | Result |
|---|---|
| Browser tests (SMS-57) | **43 / 45** — M2 and S3 fail |
| API and acceptance tests | **401 / 402** — N5 fails |
| `check:test-first` | 29 / 29 — every interface file is proven to be later than its test |

Each of the three failures was examined before anything was changed. Two are
defects of a test; one is a defect of the API that the interface exposed.

## 2. Correction 1 — N5 (REQ-NF-009) treated the browser as an outbound call

**What it asserted.** "No outbound HTTP at all: the only network edges are the
database and the socket this server listens on" — by scanning every file under
`src/` for `fetch(`.

**Why it failed.** `src/web/api.ts` calls `fetch('/api/v1…')`. That code runs in
the client's browser and calls this server's own API — the socket N5 names,
from the other side. When N5 was written (S5.5) nothing under `src/` ran in a
browser, so "a file under `src/`" and "the server" were the same thing; the
UI-GATE (`spec/ui/screens.md` §2.2–2.3) made them different.

**Why not change the code.** Avoiding the word `fetch` would pass the scan and
defeat its purpose. The intent — REQ-NF-009, no payment gateway or other
external integration — is a statement about where data goes, so the test is
made precise instead.

**The correction.**

| Before | After |
|---|---|
| every `src/**/*.ts` must contain no `fetch(` | the server (`src/` minus `src/web/`) must contain no `fetch(` — unchanged rule |
| — | **new:** every `fetch` in `src/web/` targets a relative `` `/api/v1… `` path; at least one exists; no `XMLHttpRequest`, `sendBeacon`, `WebSocket` or `EventSource` |

The new half is stricter than the old rule for the browser code: it names the
one allowed target. It was checked to bite — replacing the target with
`https://evil.example/api/v1…` fails it:

```
AssertionError: src/web/api.ts: `https://evil.example/api/v1${path}`: expected … to match /^`\/api\/v1/
```

## 3. Correction 2 — M2 measured a page that was being replaced

**What failed.** `page.evaluate: Execution context was destroyed, most likely
because of a navigation`. M2 tapped **Reschedule** and measured at once; the tap
starts the navigation to C3 (`screens.md` §4.2: the button opens C3), and the
measurement ran while the old page unloaded.

**The correction.** Wait for C3's **New date** field before measuring. The
assertion itself (layout width = device width, no horizontal scroll) is
unchanged. M1 and M3 already wait for a banner before measuring.

## 4. Defect — the administrator is treated as a master (SMS-71)

**Found by** S3: after the administrator signs in, `getByText('Salon
Administrator')` matched two elements — the header, and an `<option>` of A1's
**Master** filter. The filter's options come from R1.

**What the API does** (red run of K1–K5):

| Case | Request | Expected | Answered |
|---|---|---|---|
| K1 | R1 `GET /admin/masters` | the administrator is not in `items` | listed |
| K2 | R3 `GET /admin/masters/{adminId}` | 404 `NOT_FOUND` | **200**, the administrator's row |
| K3 | R4 `PATCH /admin/masters/{adminId}` `{active:false}` | 404, the administrator can still sign in | **200** — the only administrator deactivated |
| K4 | R11 with `masterId = adminId` | 422 `BUSINESS_RULE_VIOLATION` | **201** — a price for the administrator |
| K5 | R11 with a `masterId` naming no row | 422 `BUSINESS_RULE_VIOLATION` | **500** `INTERNAL_ERROR` (unchecked foreign key) |

**What the specification says.** The administrator is a separate actor, not a
master (SRS v1.3 glossary); REQ-F-017: one administrator, who can log in.
D10 / D-19 (header of `src/modules/public/service.ts`): "every master read
filters on `role = 'master'`; an administrator id is therefore a 404 on a
master operation". P4, P5 and the booking path (P8, P11, R19) apply it; R1, R3,
R4 and R11 do not. K3 is the serious one: R4 lets the administrator lock the
salon out of its only staff-management account.

**Decision needed — the code of K4/K5.** `error-model.md` does not say what R11
answers when `masterId` names no master. The body is valid against the schema,
so `VALIDATION_ERROR` does not fit; R11 declares no 404 (and a 404 would speak
about the link resource, not the referenced master). The proposal is
**422 `BUSINESS_RULE_VIOLATION`**, the code P8 and R19 already give for "the
requested master is not bookable" (D4) — the same situation in another
operation. If the developer prefers another declared code, K4/K5 change
before the fix.

**Planned fix.** `src/modules/masters/service.ts`: `listMasters`, `findMaster`
and `updateMaster` filter `role = 'master'`. `src/modules/master-services`:
before inserting, R11 checks that `masterId` names a master (and `serviceId` a
service) and answers 422 `BUSINESS_RULE_VIOLATION` otherwise. No contract change
(R1, R3, R4 and R11 already declare 200/404/422), no change to an approved test.

## 5. Checklist

| # | Question | Answer |
|---|---|---|
| 1 | Is each correction a defect of the test, not a fit to the code? | Yes — N5's premise predates the browser code; M2 raced a navigation. Neither assertion was weakened; N5's became stricter |
| 2 | Is each defect case traced to an approved source? | Yes — REQ-F-017, glossary, D10/D-19, D4, R11's declared 422 |
| 3 | Do K1–K5 fail for the stated reason? | Yes — §4 table, "Answered" column |
| 4 | Contract or SRS change? | No |
| 5 | Approved tests changed? | N5 and M2 only, as recorded here |

## 6. Decision

**GO.** Both corrections accepted; K4/K5 answer **422 `BUSINESS_RULE_VIOLATION`** as proposed. Signed by setrios on 2026-11-26, recorded by the coding agent at the developer's instruction.
