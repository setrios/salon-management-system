# TDD log — SMS-14 (S1.2 reference data tests)

| Field | Value |
|---|---|
| Ticket | SMS-14 — Test reference data (`docs/ticket-list.md` row SMS-14). Scope extended by the human on 2026-11-08 to the whole R1–R17 surface; see §8 |
| Stage | S1.2 |
| Date | 2026-11-08 |
| Test file | `tests/api/reference-data.test.ts` — 88 assertions |
| Fixture | `tests/helpers/reference-data.ts` — inserts the three seed categories (REQ-F-024 / SCN-08 Given) |
| Contract | `openapi.yaml#/paths/~1admin~1masters`, `~1admin~1masters~1{masterId}`, `~1admin~1services`, `~1admin~1services~1{serviceId}`, `~1admin~1categories`, `~1admin~1master-services`, `~1admin~1master-services~1{masterServiceId}`, `~1admin~1materials`, `~1admin~1materials~1{materialId}`, `~1admin~1units`; `error-model.md` §3–§4. The six public operations P1–P6 are owned by S2.1 and are outside this file |
| Gate | `logs/gates/2026-11-08-test-SMS-14.md` — draft; **not signed** |

## 1. What the test commit contains

| File | Change |
|---|---|
| `tests/api/reference-data.test.ts` | new — 88 assertions over R1–R17, SCN-08 and the three seed categories |
| `tests/helpers/reference-data.ts` | new — inserts the three seed categories directly; no contract operation creates a category |
| `tests/manifest.json` | entry added in this same commit: `SMS-14 (test) → SMS-23 (implementation)`, sources REQ-F-018, REQ-F-024, REQ-F-025, SCN-08, and the ten module files SMS-23 is planned to create (plan §5's `modules/<component>/routes.ts` + `service.ts` shape) |

No behaviour is implemented by this commit and no source file is touched. The
working tree holds exactly these three files:

```
$ git status --short
 M tests/manifest.json
?? tests/api/reference-data.test.ts
?? tests/helpers/reference-data.ts
```

The fixture writes to `public.categories` before that table exists, which is the
expected RED for SCN-08 (SQLSTATE 42P01); the table is part of what SMS-23
creates. This mirrors S1.1, where the fixture wrote `public.masters` before the
table existed (`logs/tdd/tdd-SMS-21.md` §5).

## 2. Assertion inventory

| Group | # | Assertions | RED state |
|---|---|---|---|
| Authentication and role, every operation | 34 | R1–R17 × {401 without a token, 403 `FORBIDDEN` with a master token}; each request carries a valid body and UUID path parameters, so only the guard can reject it | 34 fail — 404 measured for both |
| Masters R1–R4 | 14 | R2: 201 `Master` + `Location`, duplicate username → 409, missing `password` → 422 `REQUIRED`, unknown property → 422 `UNKNOWN_FIELD`, non-JSON → 415; R1: page shape, `active` filter after R4, `page=abc` → 400; R3: by id, unknown id → 404; R4: `fullName` + `active:false` and the resource still returned, empty patch → 422, unknown id → 404, non-JSON → 415 | 12 fail; 2 pass (§5) |
| Services and categories R5–R9 + SCN-08 | 16 | SCN-08 full scenario (custom category saved, seeds present as Given, custom selectable for a second service, seeds unchanged); categories immutable through the API (POST/DELETE → 405); R9 admin list; R6 zero duration → 422, non-JSON → 415; R5 page + `category` filter, `active` filter after R8, `page=abc` → 400; R7 by id + unknown → 404; R8 deactivation, empty patch → 422 + unknown → 404, non-JSON → 415; DELETE on a service path → 405 | 14 fail (5 of them 42P01 on the seed fixture); 2 pass (§5) |
| Master-service links R10–R12 | 10 | R11: 201 `MasterService` + `Location`, duplicate link → 409, negative price → 422, non-JSON → 415; R10: list + `masterId`/`serviceId` filters, `active` filter after R12, `page=abc` → 400; R12: price update + `active:false`, empty patch → 422 + unknown → 404, non-JSON → 415 | 10 fail |
| Materials and units R13–R17 | 14 | R14: 201 with `initialStockQuantity` → `stockQuantity`, custom unit `sachet`, duplicate name → 409, negative stock → 422, missing `unit` → 422 `REQUIRED`, non-JSON → 415; R13: `q` + `active` filters, `page=abc` → 400; R15: by id + unknown → 404; R16: rename/unit/deactivate, rename to an existing name → 409, empty patch → 422 + unknown → 404, non-JSON → 415; R17: standard `ml,l,g,kg,pcs` and custom units in use | 14 fail |
| **Total** | **88** | | **84 fail, 4 pass** |

Success responses are validated with `getSchemaValidator` against the compiled
contract (`Master`, `MasterAdminPage`, `Service`, `ServicePage`, `CategoryList`,
`MasterService`, `MasterServicePage`, `Material`, `MaterialPage`, `UnitList`);
error responses are validated against `Problem` and pinned to
`application/problem+json` exactly. No response shape is restated by hand.

## 3. RED run — verbatim output

```
$ npx vitest run tests/api/reference-data.test.ts --reporter=verbose

× authentication and role on every administrator operation > R1 get /api/v1/admin/masters answers 401 without a token
× authentication and role on every administrator operation > R2 post /api/v1/admin/masters answers 401 without a token
× authentication and role on every administrator operation > R3 get /api/v1/admin/masters/3b2d76c9-f4bb-4cad-9b4a-490752aaf237 answers 401 without a token
× authentication and role on every administrator operation > R4 patch /api/v1/admin/masters/0acf687b-d6ac-4fe5-bc37-b54c644ce832 answers 401 without a token
× authentication and role on every administrator operation > R5 get /api/v1/admin/services answers 401 without a token
× authentication and role on every administrator operation > R6 post /api/v1/admin/services answers 401 without a token
× authentication and role on every administrator operation > R7 get /api/v1/admin/services/d36fdb01-9e83-4c5c-9b63-68ee2ca5ff35 answers 401 without a token
× authentication and role on every administrator operation > R8 patch /api/v1/admin/services/7022a52d-402b-4743-a63b-d845f491db71 answers 401 without a token
× authentication and role on every administrator operation > R9 get /api/v1/admin/categories answers 401 without a token
× authentication and role on every administrator operation > R10 get /api/v1/admin/master-services answers 401 without a token
× authentication and role on every administrator operation > R11 post /api/v1/admin/master-services answers 401 without a token
× authentication and role on every administrator operation > R12 patch /api/v1/admin/master-services/7ca50242-417d-4424-a9e9-cfa951e0b235 answers 401 without a token
× authentication and role on every administrator operation > R13 get /api/v1/admin/materials answers 401 without a token
× authentication and role on every administrator operation > R14 post /api/v1/admin/materials answers 401 without a token
× authentication and role on every administrator operation > R15 get /api/v1/admin/materials/12a4ac04-ee0c-4326-b210-a0d854b7ba45 answers 401 without a token
× authentication and role on every administrator operation > R16 patch /api/v1/admin/materials/e4c035e8-e247-443b-9075-e78ddc81c534 answers 401 without a token
× authentication and role on every administrator operation > R17 get /api/v1/admin/units answers 401 without a token
× authentication and role on every administrator operation > R1 get /api/v1/admin/masters answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R2 post /api/v1/admin/masters answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R3 get /api/v1/admin/masters/3b2d76c9-f4bb-4cad-9b4a-490752aaf237 answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R4 patch /api/v1/admin/masters/0acf687b-d6ac-4fe5-bc37-b54c644ce832 answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R5 get /api/v1/admin/services answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R6 post /api/v1/admin/services answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R7 get /api/v1/admin/services/d36fdb01-9e83-4c5c-9b63-68ee2ca5ff35 answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R8 patch /api/v1/admin/services/7022a52d-402b-4743-a63b-d845f491db71 answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R9 get /api/v1/admin/categories answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R10 get /api/v1/admin/master-services answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R11 post /api/v1/admin/master-services answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R12 patch /api/v1/admin/master-services/7ca50242-417d-4424-a9e9-cfa951e0b235 answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R13 get /api/v1/admin/materials answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R14 post /api/v1/admin/materials answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R15 get /api/v1/admin/materials/12a4ac04-ee0c-4326-b210-a0d854b7ba45 answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R16 patch /api/v1/admin/materials/e4c035e8-e247-443b-9075-e78ddc81c534 answers 403 FORBIDDEN for a master token
× authentication and role on every administrator operation > R17 get /api/v1/admin/units answers 403 FORBIDDEN for a master token
× masters (R1–R4) > R2 creates a master and returns the 201 Master shape with a Location
× masters (R1–R4) > R2 answers a duplicate username with 409 DUPLICATE_RESOURCE
× masters (R1–R4) > R2 answers a body missing password with 422 and a field-level error
× masters (R1–R4) > R2 answers an unknown body property with 422 UNKNOWN_FIELD
× masters (R1–R4) > R2 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
× masters (R1–R4) > R1 lists masters as a MasterAdminPage containing the created account
× masters (R1–R4) > R1 filters by active after R4 deactivates an account
× masters (R1–R4) > R1 answers an ill-typed page parameter with 400 MALFORMED_REQUEST
× masters (R1–R4) > R3 returns one master by id
✓ masters (R1–R4) > R3 answers an unknown id with 404 NOT_FOUND
× masters (R1–R4) > R4 changes fullName and deactivates through active:false, never deletes
× masters (R1–R4) > R4 answers an empty patch with 422 VALIDATION_ERROR
✓ masters (R1–R4) > R4 answers an unknown id with 404 NOT_FOUND
× masters (R1–R4) > R4 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
× services and categories (R5–R9), including SCN-08 > SCN-08 saves a service with a category outside the seeds
× services and categories (R5–R9), including SCN-08 > SCN-08: Hair, Coloring and Barbering are present as the Given
× services and categories (R5–R9), including SCN-08 > SCN-08: a custom category becomes selectable for future services
× services and categories (R5–R9), including SCN-08 > SCN-08: the three seeds stay seeded and unchanged after custom categories
✓ services and categories (R5–R9), including SCN-08 > categories are immutable through the API: no create or delete operation
× services and categories (R5–R9), including SCN-08 > R9 lists the same categories for the administrator
× services and categories (R5–R9), including SCN-08 > R6 answers a zero base duration with 422 VALIDATION_ERROR
× services and categories (R5–R9), including SCN-08 > R6 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
× services and categories (R5–R9), including SCN-08 > R5 lists services as a ServicePage and filters by category
× services and categories (R5–R9), including SCN-08 > R5 filters by active after R8 deactivates a service
× services and categories (R5–R9), including SCN-08 > R5 answers an ill-typed page parameter with 400 MALFORMED_REQUEST
× services and categories (R5–R9), including SCN-08 > R7 returns one service and answers an unknown id with 404
× services and categories (R5–R9), including SCN-08 > R8 deactivates a service through active:false (REQ-F-018, POS-19)
× services and categories (R5–R9), including SCN-08 > R8 answers an empty patch with 422 and an unknown id with 404
× services and categories (R5–R9), including SCN-08 > R8 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
✓ services and categories (R5–R9), including SCN-08 > DELETE on a service path answers 405 METHOD_NOT_ALLOWED (no deletion)
× master-service links (R10–R12) > R11 links a service to a master with a price
× master-service links (R10–R12) > R11 answers a duplicate link with 409 DUPLICATE_RESOURCE
× master-service links (R10–R12) > R11 answers a negative price with 422 VALIDATION_ERROR
× master-service links (R10–R12) > R11 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
× master-service links (R10–R12) > R10 lists links and filters by masterId and serviceId
× master-service links (R10–R12) > R10 filters by active after R12 deactivates a link
× master-service links (R10–R12) > R10 answers an ill-typed page parameter with 400 MALFORMED_REQUEST
× master-service links (R10–R12) > R12 updates the price and deactivates the link
× master-service links (R10–R12) > R12 answers an empty patch with 422 and an unknown id with 404
× master-service links (R10–R12) > R12 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
× materials and units (R13–R17) > R14 creates a material with the initial stock as stockQuantity
× materials and units (R13–R17) > R14 saves a material with a custom unit (REQ-F-025, POS-22)
× materials and units (R13–R17) > R14 answers a duplicate material name with 409 DUPLICATE_RESOURCE
× materials and units (R13–R17) > R14 answers a negative initial stock with 422 VALIDATION_ERROR
× materials and units (R13–R17) > R14 answers a body missing unit with 422 VALIDATION_ERROR
× materials and units (R13–R17) > R14 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
× materials and units (R13–R17) > R13 lists materials and filters by q and active
× materials and units (R13–R17) > R13 answers an ill-typed page parameter with 400 MALFORMED_REQUEST
× materials and units (R13–R17) > R15 returns one material and answers an unknown id with 404
× materials and units (R13–R17) > R16 renames, changes the unit and deactivates a material
× materials and units (R13–R17) > R16 answers a rename to an existing name with 409 DUPLICATE_RESOURCE
× materials and units (R13–R17) > R16 answers an empty patch with 422 and an unknown id with 404
× materials and units (R13–R17) > R16 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE
× materials and units (R13–R17) > R17 lists the five standard units and the custom units in use
 Test Files  1 failed (1)
      Tests  84 failed | 4 passed (88)
```

Two representative failure bodies, verbatim:

```
 FAIL  tests/api/reference-data.test.ts > … > R17 get /api/v1/admin/units answers 401 without a token
AssertionError: expected 404 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 404
```

```
 FAIL  tests/api/reference-data.test.ts > … > SCN-08 saves a service with a category outside the seeds
error: relation "public.categories" does not exist
Serialized Error: { length: 116, severity: 'ERROR', code: '42P01', detail: undefined, hint: undefined, position: '13', internalPosition: undefined, internalQuery: undefined, where: undefined, schema: undefined, table: undefined, dataType: undefined, constraint: undefined, file: 'parse_relation.c', routine: 'parserOpenTable' }
```

Failure-message census over the 84 failures:

```
     15 AssertionError: expected 404 to be 201
     12 AssertionError: expected 404 to be 200
      8 AssertionError: expected 404 to be 422
      6 AssertionError: expected 404 to be 415
      5 error: relation "public.categories" does not exist
      4 AssertionError: expected 404 to be 400
      1 AssertionError: expected 404 to be 403
      1 AssertionError: expected 404 to be 401
```

The 401/403 counts print once each because Vitest collapses identical failures
from the whole `it.each` table into one detail block; all 34 matrix cases failed,
and a per-case run of one 401 case shows `expected 404 to be 401`.

## 4. Expected reason for each failure

| Group | Failing | Expected cause | What the implementation must change |
|---|---|---|---|
| Matrix 401/403 (34) | all | None of R1–R17 is mounted. The paths and methods are defined in the contract, so `notFound` answers 404 `NOT_FOUND`; the request never reaches a guard, and `authenticate` never runs | Mount each operation behind `authenticate` and an administrator-role check; 401 before 403 |
| Masters 12 | all | R1–R4 are not mounted → 404. R2's 409 also needs the unique username constraint and its mapping; 422 needs `validateBody('MasterCreate'/'MasterPatch')` (the 422 path already exists for operations declaring 422) | `modules/masters` routes + service, `validateBody`, unique-username → 409 |
| Services/categories 14 | 14 | R5–R9 are not mounted → 404. Five fail earlier: the fixture cannot insert the seed categories because `public.categories` does not exist (42P01) — the table is part of SMS-23 | `modules/catalog` + `modules/units`, the `categories` and `services` tables, implicit category upsert on service creation, public `GET /categories` |
| Master-service links 10 | all | R10–R12 are not mounted → 404. R11's 409 needs a unique `(master_id, service_id)` constraint; 422 needs the body validator | `modules/master-services`, link table with the unique pair |
| Materials/units 14 | all | R13–R17 are not mounted → 404. R14/R16 409 needs a unique material name; 422 needs the body validator; R17 needs the units module | `modules/materials` + `modules/units`, material table with unique name |

Every measured status is a missing behaviour, not a broken test: 404 is exactly
what the S1.0 control run records for unregistered operations, and 42P01 is the
table this stage introduces.

## 5. Assertions that are already green — characterisation, not RED evidence

| Assertion | Why it already passes | Value after GREEN |
|---|---|---|
| R3 unknown master id → 404 `NOT_FOUND` | Any unmatched path is 404, so the test passes for the fallback's reason, not the operation's | Re-valued once R3 exists: the same status must now come from the operation's "id not found" branch, with the sibling positive test proving the route is mounted |
| R4 unknown master id → 404 | Same | Same |
| Categories immutable through the API: `POST`/`DELETE /admin/categories` → 405 | The contract defines `/admin/categories` with `GET` only; the SMS-44 path matcher already answers 405 for a defined path with an undefined method. This is genuine contract behaviour and stays green | Pins "categories are never created or deleted through the API"; creation is implicit through a service |
| `DELETE /admin/services/{id}` → 405 | Same matcher; `error-model.md` §4 and NEG-16/POS-19 fix 405 for this path | Pins "services are deactivated, never deleted" (REQ-F-018) |

The two 404s are the one place where an assertion is green at RED for a trivial
reason. They are kept because the negative is part of the operation's contract;
the gate states that their RED contributes no ordering evidence.

## 6. What this RED does not prove — declared gaps

Named here and in the gate, so the signature is a conscious decision:

| Gap | Why there is no assertion |
|---|---|
| 409 on R4, R6, R8, R12 | Declared but unreachable: no allowed request can violate the three unique constraints the error model names. Disposition in **CL-10** (`spec/api/clarifications.md`) — not implemented, not tested |
| Service-name uniqueness | `Service.name` is not unique in `error-model.md` §3. Disposition in **CL-10** |
| Public P1–P6 | Owned by S2.1 (client booking flow). Outside this file and outside the gate's authorised surface; they keep answering 404 until S2.1 mounts them. The category set is observed through R9 (`GET /admin/categories`), not through P3 |
| `GET /categories` declares 400 | P3 takes no parameters and `resource-model.md` §5 (P3) lists no 400. Disposition in **CL-10** |
| `pageSize` boundaries (0, 101) and `page` = 0 | Not asserted; the typed-query negative is NEG-03's `page=abc` → 400, asserted once per list operation |
| Filter combinations and unknown filter keys | Only one filter per list operation is exercised, plus `active` after deactivation |
| List ordering | The contract fixes no order; assertions use `arrayContaining`, never positional equality |
| Malformed JSON → 400 on these operations | The generic branch is proven in S1.0 (`structural.test.ts`) and S1.1; it is not re-asserted per operation |
| Fresh-install self-seeding | The harness truncates every table before each file, so a seed mechanism that runs at start-up or at migration time is not observable through the suite. The seeds are arranged by the fixture; whether a fresh installation seeds itself is checked in the S1.2 control run, not here |
| Undefined-method coverage | Representative: DELETE on a service path and POST/DELETE on `/admin/categories`. Not asserted for every defined path |
| Field boundary values | `password` length/pattern, name lengths, `stockQuantity` fractional values are covered by the contract's validators, not enumerated per boundary here |
| Built-artifact coverage | Still a control run, not a test (`runs-01` §4); runs-03 is the S1.2 candidate |

## 7. Declared schema — `categories` (S1.2, fixture)

The fixture (`tests/helpers/reference-data.ts`) arranges the SCN-08 Given in
storage, so the columns it writes are declared here **before** anything writes
them, as plan §5.1 did for `masters` in S1.1.

| Column | Type | Constraints | Contract or decision |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | row identity; not exposed by `Category` |
| `name` | `text` | not null, **unique** | `Category.name`; the fixture's `on conflict (name)` requires the unique constraint |
| `seeded` | `boolean` | not null, default `false` | `Category.seeded`; `true` exactly for Hair, Coloring, Barbering |
| `created_at` | `timestamptz` | not null, default `now()` | housekeeping, as on every other table |

The fixture writes only `name` and `seeded`; `id` and `created_at` are left to
the column defaults. That the API exposes exactly `name` and `seeded` is
`Category`'s definition, not a decision of this file.

Consequences the implementation must honour, each with an assertion: saving a
service with a category that does not exist creates the category with
`seeded = false` and the same category is then selectable for another service;
the three seeds never change their `seeded` value and are never removed.

## 8. Decisions this gate records

| ID | Kind | Content |
|---|---|---|
| D-21 | decision — scope (human, 2026-11-08) | Ticket SMS-14's title in `docs/ticket-list.md` is "custom service category + seeds (SCN-08)". The human extended the test scope to the whole reference surface SMS-23 implements: every operation R1–R17 gets at least one status-and-shape assertion plus a negative wherever the contract declares 401/403/404/409/422; SCN-08 is asserted as a full scenario; the three seeds are asserted present and immutable. Extension, not supersession: SCN-08 remains and is fully covered |
| D-22 | decision — closed request bodies | Request bodies are closed objects: the contract sets `additionalProperties: false` on every `*Create` and `*Patch` schema, so an unknown property is 422 `UNKNOWN_FIELD`, not silently ignored. This is the contract's own rule, restated here because the assertion depends on it |
| D-23 | decision — fixture | The three seeds are arranged by `tests/helpers/reference-data.ts` writing `categories(name, seeded)`, because no contract operation creates a category (creation is implicit through a service). Columns declared in §7. `on conflict (name) do nothing` makes the fixture idempotent, so an implementation that also seeds at start-up is not fought |
| D-24 | decision — 409 reachability | Only the three unique constraints the error model names may produce 409: master username (R2), the master-service link (R11), material name (R14, R16). The declared-but-unreachable 409s are **CL-10**: not implemented, not tested, no rule invented |
| D-25 | decision — deactivation | REQ-F-018's "deactivate, never delete" is `PATCH {active:false}`; the resource is still returned by its GET afterwards, and no DELETE operation exists for masters, materials or links (services' DELETE is 405). Asserted for masters, services, links and materials |
| D-26 | decision — units | `UnitList.standard` is the fixed five `ml,l,g,kg,pcs`; `UnitList.custom` is the distinct non-standard units in use by materials. A material may be created with a custom unit (REQ-F-025); the list then offers it |
| D-27 | decision — categories | Categories are never created, renamed or deleted through the API. A new category exists because a service was saved with it. At this stage the category set is observed through `GET /admin/categories` (R9); the public listing is P3 and arrives with S2.1. `seeded` is true exactly for the three seeds |

Plan §8.1 lists the S1.2 test tickets as "SMS-14, SMS-21". SMS-21's
authentication half was delivered in S1.1 (`logs/tdd/tdd-SMS-21.md`); this file
is the S1.2 test ticket and is recorded as SMS-14. No second SMS-21 test ticket
exists for S1.2 — a bookkeeping note, not a decision to sign.

## 9. No implementation was written before the gate

`git status --short` (§1) lists only the test file, its fixture and the manifest
entry. No file under `src/` changed. No route, table, module or middleware was
added or edited.

## 10. Causal independence

The `tests/manifest.json` entry is in the `test:` commit. It lists the ten files
SMS-23 is planned to create (plan §5's `modules/<component>/routes.ts` and
`service.ts` for `masters`, `catalog`, `master-services`, `materials`, `units`);
none exists now, so each takes the checker's "not committed yet (unambiguously
after the test)" branch. Files SMS-23 only modifies are under `"touches"`.

Before the `test:` commit the checker cannot pass — its first step is to find the
commit that added the test file:

```
$ npm run check:test-first -- --verbose
PASS SMS-21 (test) → SMS-22 (implementation) tests/api/auth.test.ts
     · test added in 89a9923e404c test: add S1.1 authentication tests (SMS-21)
     · header cites REQ-F-012, REQ-F-017
     · src/modules/auth/password.ts: added later in 33fffd2132a6 feat: implement S1.1 authentication (SMS-22)
     · src/modules/auth/tokens.ts: added later in 33fffd2132a6 feat: implement S1.1 authentication (SMS-22)
     · src/modules/auth/service.ts: added later in 33fffd2132a6 feat: implement S1.1 authentication (SMS-22)
     · src/modules/auth/routes.ts: added later in 33fffd2132a6 feat: implement S1.1 authentication (SMS-22)
FAIL SMS-14 (test) → SMS-23 (implementation) tests/api/reference-data.test.ts
     ✗ tests/api/reference-data.test.ts: no commit adds this file, so the ordering cannot be proven. Commit it with the ticket's `test:` commit first.

check-test-first: 1/2 entries pass.
exit=1
```

Expected immediately after the `test:` commit, with no other change:

```
PASS SMS-21 (test) → SMS-22 (implementation) tests/api/auth.test.ts
PASS SMS-14 (test) → SMS-23 (implementation) tests/api/reference-data.test.ts
     · test added in <sha> test: add S1.2 reference-data tests (SMS-14)
     · header cites REQ-F-018, REQ-F-024, REQ-F-025, SCN-08
     · src/modules/masters/routes.ts: not committed yet (unambiguously after the test)
     · … nine more of the same
check-test-first: 2/2 entries pass.
```

## 11. GREEN run — SMS-23 implementation

To be completed after the gate is signed and SMS-23 is implemented.

Required evidence at GREEN:

1. `npm test` twice consecutively — 113/113 on both runs (the harness keeps
   state per file, not per test; a second run must not depend on the first).
2. `npm test -- --sequence.shuffle` — 113/113. The 88 assertions in this file
   share one truncated database, so they must be order-independent (unique names,
   no assertion that depends on a test that ran earlier). A shuffle failure is a
   defect in these tests, fixed before the `feat:` commit is recorded; the fix
   and its reason go in this section.

The pre-commit shuffled run at RED kept the same four passing tests (`84 failed
| 4 passed`), so no order-dependence is visible before implementation.
