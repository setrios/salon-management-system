# TDD log — SMS-21 (S1.1 authentication tests)

| Field | Value |
|---|---|
| Ticket | SMS-21 — Test auth (issue to be created from `docs/ticket-list.md` row SMS-21) |
| Stage | S1.1 |
| Date | 2026-11-08 |
| Test file | `tests/api/auth.test.ts` — 15 assertions |
| Fixture | `tests/helpers/accounts.ts` — seeds one administrator and one master |
| Contract | `openapi.yaml#/paths/~1auth~1login/post`, `~1auth~1me/get`; `error-model.md` §3–§4 |
| Gate | `logs/gates/2026-11-08-test-SMS-21.md` — **SIGNED — GO**, 2026-11-08 |

## 1. What the test commit contains

| File | Change |
|---|---|
| `tests/api/auth.test.ts` | new — 15 assertions over login, bearer tokens, and the absence of self-registration |
| `tests/helpers/accounts.ts` | new — fixture that inserts a staff account directly, because neither account kind can be created through the API at S1.1 |
| `tests/manifest.json` | entry added in this same commit: the test file, its sources, and the four files SMS-22 will create. Plan §6.2 requires the entry in the `test:` commit, and `checkEntry` accepts implementation paths that do not exist yet |

No behaviour is implemented by this commit. `src/db/schema.ts` is touched in its
header comment only, to declare the `masters` columns the fixture writes (plan
§5.1); that declaration is documentation, not a table definition, and the
module still exports nothing.

The fixture exists because of the account model, not for convenience: REQ-F-017
allows exactly one administrator, and the contract defines no operation that
creates one, so it is provisioned out of band; masters are created by the
administrator through `POST /admin/masters`, which arrives in S1.2 (SMS-23). A
test of *authentication* must start from an account that exists, so it arranges
one in storage.

## 2. Assertion inventory

| Group | # | Assertion | Status in RED |
|---|---|---|---|
| Request shape (no account) | 1 | non-JSON body → 415 `UNSUPPORTED_MEDIA_TYPE` | fails, 404 measured |
| | 2 | no body → 400 `MALFORMED_REQUEST` | fails, 404 measured |
| | 3 | body missing `password` → 400 `MALFORMED_REQUEST` (CL-09) | fails, 404 measured |
| Bearer token (no account) | 4 | `/auth/me` without `Authorization` → 401 `UNAUTHENTICATED` | fails, 404 measured |
| | 5 | `/auth/me` with a non-JWT token → 401 | fails, 404 measured |
| | 6 | `/auth/me` with a token signed by another key → 401 | fails, 404 measured |
| | 7 | `/auth/me` with an expired token → 401 | fails, 404 measured |
| Credentials (seeded accounts) | 8 | administrator login → 200, `LoginResponse`, `role: admin`, `expiresIn` = `config.jwtExpiresIn` | not executed — fixture could not insert (see §5) |
| | 9 | master login → 200, `role: master` (REQ-F-012) | not executed — same cause |
| | 10 | login response carries no credential material | not executed — same cause |
| | 11 | wrong password → 401 `UNAUTHENTICATED` | not executed — same cause |
| | 12 | unknown username → the same 401, no user enumeration | not executed — same cause |
| | 13 | issued token authorises `/auth/me` → 200 `Principal` (`id`, `role`, `displayName`) | not executed — same cause |
| Self-registration | 14 | `POST /auth/register` → 404 `NOT_FOUND` (REQ-F-012) | **passes** — characterisation |
| | 15 | `POST /masters` → 405 `METHOD_NOT_ALLOWED` | **passes** — characterisation |

## 3. RED run — verbatim output

```
$ npx vitest run tests/api/auth.test.ts --reporter=verbose

 RUN  v4.1.12 /home/novell/Documents/VScode-projects/pis/salon-management-system

 × tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — request shape, no account needed > answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE 23ms
   → expected 404 to be 415 // Object.is equality
 × tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — request shape, no account needed > answers a login without a body with 400 MALFORMED_REQUEST 3ms
   → expected 404 to be 400 // Object.is equality
 × tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — request shape, no account needed > answers a login missing the password with 400 MALFORMED_REQUEST 6ms
   → expected 404 to be 400 // Object.is equality
 × tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me without an Authorization header with 401 UNAUTHENTICATED 2ms
   → expected 404 to be 401 // Object.is equality
 × tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me with a token that is not a JWT with 401 UNAUTHENTICATED 2ms
   → expected 404 to be 401 // Object.is equality
 × tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me with a token signed by another key with 401 UNAUTHENTICATED 3ms
   → expected 404 to be 401 // Object.is equality
 × tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me with an expired token with 401 UNAUTHENTICATED 2ms
   → expected 404 to be 401 // Object.is equality
 ↓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — valid and invalid credentials > issues an administrator token with role admin
 ↓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — valid and invalid credentials > issues a master token with role master
 ↓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — valid and invalid credentials > returns no credential material in the login response
 ↓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — valid and invalid credentials > answers a wrong password with 401 UNAUTHENTICATED
 ↓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — valid and invalid credentials > answers an unknown username with the same 401 UNAUTHENTICATED
 ↓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — valid and invalid credentials > authorises GET /auth/me with the issued token
 ✓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > self-registration is not an operation > answers POST /auth/register with 404 NOT_FOUND 8ms
 ✓ tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > self-registration is not an operation > answers POST /masters with 405 METHOD_NOT_ALLOWED 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — valid and invalid credentials
error: relation "public.masters" does not exist
 ❯ node_modules/pg-pool/index.js:45:11
 ❯ seedAccount tests/helpers/accounts.ts:81:3
     79|   const id = randomUUID();
     80|
     81|   await getPool().query(
       |   ^
     82|     `insert into public.masters (id, full_name, username, password_has…
     83|      values ($1, $2, $3, $4, $5, true)`,
 ❯ tests/api/auth.test.ts:200:21

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { length: 113, severity: 'ERROR', code: '42P01', detail: undefined, hint: undefined, position: '13', internalPosition: undefined, internalQuery: undefined, where: undefined, schema: undefined, table: undefined, dataType: undefined, constraint: undefined, file: 'parse_relation.c', routine: 'parserOpenTable' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/8]⎯


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — request shape, no account needed > answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
AssertionError: expected 404 to be 415 // Object.is equality

- Expected
+ Received

- 415
+ 404

 ❯ expectProblem tests/api/auth.test.ts:111:29
    109|   /** Asserts a Problem response carrying the expected status and code…
    110|   function expectProblem(response: JsonResponse, expected: { status: n…
    111|     expect(response.status).toBe(expected.status);
       |                             ^
    112|     expect(response.headers['content-type']).toBe('application/problem…
    113|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
 ❯ tests/api/auth.test.ts:130:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/8]⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — request shape, no account needed > answers a login without a body with 400 MALFORMED_REQUEST
AssertionError: expected 404 to be 400 // Object.is equality

- Expected
+ Received

- 400
+ 404

 ❯ expectProblem tests/api/auth.test.ts:111:29
    109|   /** Asserts a Problem response carrying the expected status and code…
    110|   function expectProblem(response: JsonResponse, expected: { status: n…
    111|     expect(response.status).toBe(expected.status);
       |                             ^
    112|     expect(response.headers['content-type']).toBe('application/problem…
    113|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
 ❯ tests/api/auth.test.ts:138:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > login — request shape, no account needed > answers a login missing the password with 400 MALFORMED_REQUEST
AssertionError: expected 404 to be 400 // Object.is equality

- Expected
+ Received

- 400
+ 404

 ❯ expectProblem tests/api/auth.test.ts:111:29
    109|   /** Asserts a Problem response carrying the expected status and code…
    110|   function expectProblem(response: JsonResponse, expected: { status: n…
    111|     expect(response.status).toBe(expected.status);
       |                             ^
    112|     expect(response.headers['content-type']).toBe('application/problem…
    113|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
 ❯ tests/api/auth.test.ts:148:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/8]⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me without an Authorization header with 401 UNAUTHENTICATED
AssertionError: expected 404 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 404

 ❯ expectProblem tests/api/auth.test.ts:111:29
    109|   /** Asserts a Problem response carrying the expected status and code…
    110|   function expectProblem(response: JsonResponse, expected: { status: n…
    111|     expect(response.status).toBe(expected.status);
       |                             ^
    112|     expect(response.headers['content-type']).toBe('application/problem…
    113|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
 ❯ tests/api/auth.test.ts:156:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/8]⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me with a token that is not a JWT with 401 UNAUTHENTICATED
AssertionError: expected 404 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 404

 ❯ expectProblem tests/api/auth.test.ts:111:29
    109|   /** Asserts a Problem response carrying the expected status and code…
    110|   function expectProblem(response: JsonResponse, expected: { status: n…
    111|     expect(response.status).toBe(expected.status);
       |                             ^
    112|     expect(response.headers['content-type']).toBe('application/problem…
    113|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
 ❯ tests/api/auth.test.ts:164:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/8]⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me with a token signed by another key with 401 UNAUTHENTICATED
AssertionError: expected 404 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 404

 ❯ expectProblem tests/api/auth.test.ts:111:29
    109|   /** Asserts a Problem response carrying the expected status and code…
    110|   function expectProblem(response: JsonResponse, expected: { status: n…
    111|     expect(response.status).toBe(expected.status);
       |                             ^
    112|     expect(response.headers['content-type']).toBe('application/problem…
    113|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
 ❯ tests/api/auth.test.ts:180:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/8]⎯

 FAIL  tests/api/auth.test.ts > S1.1 authentication — login and bearer tokens > bearer token — rejected credentials, no account needed > answers GET /auth/me with an expired token with 401 UNAUTHENTICATED
AssertionError: expected 404 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 404

 ❯ expectProblem tests/api/auth.test.ts:111:29
    109|   /** Asserts a Problem response carrying the expected status and code…
    110|   function expectProblem(response: JsonResponse, expected: { status: n…
    111|     expect(response.status).toBe(expected.status);
       |                             ^
    112|     expect(response.headers['content-type']).toBe('application/problem…
    113|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
 ❯ tests/api/auth.test.ts:194:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/8]⎯


 Test Files  1 failed (1)
      Tests  7 failed | 2 passed | 6 skipped (15)
   Start at  16:57:44
   Duration  747ms (transform 71ms, setup 29ms, import 507ms, tests 106ms, environment 0ms)
```

The run above predates a comment-only edit to the test header (D-20 became
CL-09 after the register was updated). Re-run afterwards with no assertion
change: `Tests 7 failed | 2 passed | 6 skipped (15)` — identical counts.

## 4. Expected reason for each failure

| # | Failing assertion | Expected cause | What the implementation must change |
|---|---|---|---|
| 1 | non-JSON body → **415** (received 404) | No auth router is mounted. `POST /auth/login` is a contract path with `POST` defined, so `notFound` answers 404 — the operation is simply not registered yet. The 415 branch already exists in `middleware/validate.ts`; nothing mounts it (plan §8.2 predicted exactly this) | Register the login route with `validateBody('login')` |
| 2 | no body → **400** (received 404) | Same: no route. error-model.md §4 makes a missing body 400, never 415 | Same route; `validateBody` already returns 400 for an absent body |
| 3 | body missing `password` → **400** (received 404) | Same, plus CL-09: `validateBody` currently answers schema violations with 422, which `login` does not declare | Route + the 400 mapping for an operation with no 422 response (CL-09) |
| 4–7 | `/auth/me` → **401** (received 404) | `GET /auth/me` is a contract path with `GET` defined, so `notFound` answers 404. No authentication middleware is mounted, so no credential is ever examined | Mount `GET /auth/me` behind bearer verification: missing header, unparseable token, wrong signature and expired token all become 401 `UNAUTHENTICATED` |
| 8 (suite, six assertions) | `login — valid and invalid credentials` fails in `beforeAll`: `relation "public.masters" does not exist` | The credential fixtures write to the `masters` table, which this ticket's implementation creates. The database was reachable — the error is SQLSTATE 42P01 from PostgreSQL's parser, not a connection failure — so the missing piece is the schema, not the harness | Create the `masters` table (credentials, `role`, `active`) and the login route |

Every measured value is a *missing behaviour*, not a broken test. The four
statuses received (404) are exactly what the S1.0 control run recorded for
unregistered operations, and 42P01 is the schema this stage introduces.

## 5. Why six assertions did not execute

The credential group prepares its accounts in `beforeAll`. When the table does
not exist the hook throws and Vitest reports the group as a failed suite, so its
six assertions are listed as skipped rather than failed. That report is the
honest one: the tests have not yet had a chance to make their request, and the
reason they have not is the schema the implementation is expected to create.

The expected cause for all six once the table exists is the same as for 1–7 —
no route — so a per-assertion `404` would have been the same evidence. This is
the one place in the suite where the RED is a hook failure.

**Consequence, stated plainly:** assertions 8–13 have **no RED evidence**. Their
ordering is proved by the test commit preceding the implementation commit and by
the `tests/manifest.json` entry, not by a failing run. The gate repeats this
sentence so that it is not lost between the two records.

## 6. Assertions that are already green — characterisation, not RED evidence

| Assertion | Why it already passes |
|---|---|
| `POST /api/v1/auth/register` → 404 `NOT_FOUND` | The path is not in the contract at all, so the SMS-44 matcher reports 404. The assertion pins REQ-F-012 against a future ticket that might add a registration operation |
| `POST /api/v1/masters` → 405 `METHOD_NOT_ALLOWED` | The contract defines `/masters` with `GET` only; the SMS-44 matcher already answers 405 for a defined path with an undefined method |

Both are kept because they state a requirement that no other test covers, but
the gate must not read them as evidence that these tests drove any code.

## 7. Decisions and clarification this gate records

| ID | Kind | Content |
|---|---|---|
| D-18 | decision — storage | Passwords are stored as **scrypt** hashes from `node:crypto`, serialised as `scrypt$N$r$p$salt-base64$key-base64` (N=16384, r=8, p=1, 64-byte key). No dependency is added: installing one is forbidden by CLAUDE.md, and `bcrypt` was removed from the scaffold. `pbkdf2` would change only the fixture's `hashPassword` and the verifier; no assertion changes |
| D-19 | decision — account model | The single administrator is a row of `masters` with `role = 'admin'`; master rows carry `role = 'master'`. Both are provisioned through the administrator path or out of band, never by self-registration. A separate `admins` table would change the fixture and the plan; the contract shape does not |
| CL-09 | clarification — contract inconsistency | `login` declares no 422, while `error-model.md` §3 assigns `VALIDATION_ERROR` to every body-taking operation. Disposition: a body violating `LoginRequest` is answered **400 `MALFORMED_REQUEST`**; the contract is not changed. Recorded in `spec/api/clarifications.md` (register now CLOSED — nine rows) |

CL-09 is a clarification, not a gate decision: the contract contradicts itself
and the register resolves which statement wins. The implementation rule that
follows from it is contract-derived — 422 when the operation declares it, 400
when it does not — and must not branch on `operationId`. The generated contract
does not carry response codes yet; collecting them is part of SMS-22's scope,
recorded in the gate §7.

D-18 and D-19 are implementation choices the tests depend on only through the
fixture. The `masters` columns they imply are declared in plan §5.1 and
`src/db/schema.ts` before the fixture writes them. Both rows are in the plan §3
register as part of the change that carries the gate signature, so the signed
record never cites a decision the register does not hold.

## 8. No implementation was written before the gate

```
$ git status --porcelain -uall
 M logs/2026-11-08-implementation-plan.md
 M spec/api/clarifications.md
 M src/db/schema.ts
 M tests/manifest.json
?? logs/gates/2026-11-08-test-SMS-21.md
?? logs/tdd/tdd-SMS-21.md
?? tests/api/auth.test.ts
?? tests/helpers/accounts.ts
```

No behaviour is implemented. `src/db/schema.ts` changes only its header comment,
which declares the `masters` columns (plan §5.1); the module still exports
nothing. The other modifications are records: the plan (the declaration), the
clarification register (CL-09) and the manifest (the entry). Implementation
starts only after the human signs `logs/gates/2026-11-08-test-SMS-21.md`.

## 9. Causal independence

The `tests/manifest.json` entry is part of this `test:` commit, as plan §6.2
requires ("added in the `test:` commit of its ticket"). It lists the four files
SMS-22 will create — `src/modules/auth/password.ts`, `tokens.ts`, `service.ts`,
`routes.ts` — none of which exists, so `existsAt(testCommit, implPath)` is false
and `checkEntry` takes its "not committed yet (unambiguously after the test)"
branch. Files SMS-22 only modifies are under `"touches"`, which the checker
ignores.

The checker cannot pass **before** the test file is committed, because its first
step is to find the commit that added it. That is expected, not a defect, and it
is why this stage records the command twice:

```
$ npm run check:test-first          # before the `test:` commit
FAIL SMS-21 (test) → SMS-22 (implementation) tests/api/auth.test.ts
     ✗ tests/api/auth.test.ts: no commit adds this file, so the ordering cannot be proven. Commit it with the ticket's `test:` commit first.

check-test-first: 0/1 entries pass.
exit=1
```

Expected immediately after the `test:` commit, with no other change:

```
PASS SMS-21 (test) → SMS-22 (implementation) tests/api/auth.test.ts
     · test added in <sha> test: add S1.1 authentication tests (SMS-21)
     · header cites REQ-F-012, REQ-F-017
     · src/modules/auth/password.ts: not committed yet (unambiguously after the test)
     · src/modules/auth/tokens.ts: not committed yet (unambiguously after the test)
     · src/modules/auth/service.ts: not committed yet (unambiguously after the test)
     · src/modules/auth/routes.ts: not committed yet (unambiguously after the test)

check-test-first: 1/1 entries pass.
```

After the `feat:` commit the same four notes become
`added later in <sha> feat: …`, which is the ordering this stage could not prove
from a failing run (§5).
