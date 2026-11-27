# Coding convention

| | |
|---|---|
| Ticket | SMS-53 (lab 6, step 1) |
| Applies to | `src/**/*.ts`, `tests/**/*.ts`, `scripts/*.mjs`, `src/contract/*.mjs`, the root config files |
| Does not apply to | `spec/` (approved artifacts), `logs/` (signed records), `src/db/migrations/` and `src/contract/openapi.json` (generated) |
| Base | [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html), adapted in §9 |
| Enforced by | ESLint 10 (`eslint.config.js`), Prettier 3 (`.prettierrc.json`), `tsc --strict` (`tsconfig.json`) |
| Checked with | `npm run lint`, `npm run format:check`, `npx tsc --noEmit` |

The convention exists so that a reviewer reads intent, not layout: formatting
is decided by a tool, names follow one scheme, and every exported element says
what it promises. Where a rule is enforced by a tool, the tool's rule is named;
where it cannot be, the rule is checked in review.

---

## 1. Why the Google TypeScript Style Guide

It is the most widely cited style guide written for TypeScript itself rather
than adapted from JavaScript; it covers naming, language features and
documentation comments (not only layout); and its rules map almost one to one
onto `typescript-eslint` rules, so it can be checked rather than asserted. The
existing code already followed it in most respects — the first lint run found
no naming violation at all — so adopting it describes the code more than it
changes it.

## 2. Language and compiler

| Rule | How it is enforced |
|---|---|
| TypeScript in strict mode, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch` | `tsconfig.json` |
| ES modules only (`"type": "module"`, `module: NodeNext`) | `tsconfig.json`, `package.json` |
| Relative imports carry the `.js` extension (`'./logger.js'`), as NodeNext resolution requires | `tsc` fails without it |
| Plain JavaScript only for tool scripts (`scripts/*.mjs`, `src/contract/convert.mjs`, `eslint.config.js`) | review |

## 3. Formatting

Prettier owns layout; nobody formats by hand and ESLint does not argue with it
(`eslint-config-prettier`).

| Setting | Value | Note |
|---|---|---|
| Indentation | 2 spaces | Prettier default, Google |
| Line width | **100** | Google uses 80; see §9 D1 |
| Quotes | single | Google |
| Semicolons | always | Google |
| Trailing commas | everywhere multi-line | Prettier 3 default |
| Arrow parameters | always parenthesised | Prettier default |
| Line endings | LF | |

A formatting change is committed alone, with the `style:` prefix, so that a
diff never mixes layout with logic (`docs/commit-convention.md`).

## 4. Naming

| Element | Style | Example from the code | Rule |
|---|---|---|---|
| Files | `kebab-case.ts`; tests `kebab-case.test.ts` | `admin-actions.ts`, `cancelled-reminders.test.ts` | review |
| Variables, parameters, functions, methods | `lowerCamelCase` | `listServices`, `recordCategory` | `naming-convention` |
| Module-level constants that are true constants | `CONSTANT_CASE` allowed | | `naming-convention` |
| Classes, interfaces, type aliases, enums | `UpperCamelCase` | `HttpProblem`, `ServiceView` | `naming-convention` |
| Enum members | `CONSTANT_CASE` | | `naming-convention` |
| Leading underscore | only for a parameter a signature forces and the body does not use | Express error handlers | `naming-convention`, `no-unused-vars` |

### 4.1 Domain names come from the glossary

An identifier that names a domain concept uses the term of the SRS v1.3
glossary, in its singular English form: `appointment`, `master`, `service`,
`material`, `reminder`. A synonym is not introduced for variety (`booking` is
the client's action of creating an appointment, not a second name for it).
The term-by-term audit is SMS-59 (`logs/2026-11-27-terminology-audit.md`).

Words outside the glossary keep one spelling per layer: identifiers use US
spelling (`src/modules/catalog/`, `catalogRoutes`), prose follows the
contract's UK "catalogue". A directory is not renamed for spelling alone —
`tests/manifest.json` records source paths, and `check:test-first` proves the
order of the files it names (audit finding T2).

### 4.2 Contract names are fixed

Field names, operation ids, error codes and path segments that appear in
`spec/api/openapi.yaml` were approved at API-GATE. Code that produces or
consumes them uses them exactly. Renaming one is a contract change, which goes
through an addendum, never through a lint fix.

### 4.3 No Hungarian notation

No `I` prefix on interfaces (`ServiceView`, not `IServiceView`), no type
suffixes on variables. Enforced by a custom `naming-convention` entry.

### 4.4 Property names follow their source

Object properties mirror what they describe — the contract (camelCase), a SQL
column through Drizzle, an HTTP header (`'content-type'`). The naming rule
therefore does not check object-literal and type properties.

## 5. Language rules

| # | Rule | Rule id |
|---|---|---|
| 5.1 | `const` by default, `let` when reassigned, never `var` | `prefer-const`, `no-var` |
| 5.2 | `===` and `!==`; `== null` is allowed as the one null-or-undefined test | `eqeqeq` |
| 5.3 | Named exports only. A default export is allowed where a tool requires it (`eslint.config.js`, `vitest.config.ts`, `drizzle.config.ts`, `tests/global-setup.ts`) | `no-restricted-syntax` |
| 5.4 | Braces around every multi-line control body | `curly: multi-line` |
| 5.5 | `T[]` for simple element types, `Array<…>` for complex ones | `array-type: array-simple` |
| 5.6 | No `any` in `src/`; use `unknown` and narrow. Exception for tests: §7.1 | `no-explicit-any`, `no-unsafe-*` |
| 5.7 | Every promise is awaited, returned or explicitly voided | `no-floating-promises`, `no-misused-promises` |
| 5.8 | No unused variables, imports or parameters | `no-unused-vars` |
| 5.9 | No type assertion that changes nothing | `no-unnecessary-type-assertion` |
| 5.10 | `async` only on functions that `await` | `require-await` |

## 6. Documentation comments (TSDoc)

| Rule | Enforced by |
|---|---|
| Every module starts with a `/** … */` block: what the module is, which operations or requirements it serves (`Source:` line with REQ-IDs) | review (all 61 `src/` files already do) |
| Every exported function, class, interface, type alias and enum has a doc comment | `jsdoc/require-jsdoc` (warning until SMS-60, then error) |
| Comments state purpose, parameters, result, constraints and failure modes — **not** what the next line obviously does | review |
| Types live in the TypeScript signature, never in the comment (`@param name text`, not `@param {string} name`) | `jsdoc/no-types` |
| `@param` names match the signature | `jsdoc/check-param-names` |
| `@param` / `@returns` only when they add information the name and type do not | review |
| Tags are TSDoc / JSDoc tags (`@param`, `@returns`, `@throws`, `@remarks`, `@see`, `@example`, `@typeParam`) | `jsdoc/check-tag-names` |
| A decision or a requirement is cited by its ID (`REQ-F-018`, `D-27`, `SCN-08`), so the comment stays traceable | review |

## 7. Project-specific rules

| # | Rule | Where it is visible |
|---|---|---|
| 7.1 | **Tests may use `any` for HTTP response bodies.** A supertest body is `any`; the test's oracle for its shape is the AJV validator compiled from `openapi.yaml`, not a TypeScript type, so casts would check nothing. Every other rule applies to tests. | `eslint.config.js`, `tests/**` override |
| 7.2 | **Routes are thin, services decide.** A route handler maps a request to a service call and a service result to an HTTP answer; it holds no domain rule. | `src/modules/*/routes.ts` |
| 7.3 | **HTTP errors are `HttpProblem`.** A handler or service that refuses a request throws `HttpProblem` with a code from `spec/api/error-model.md`; the error handler renders it as RFC 9457. A plain `Error` means a defect, and is answered with `500`. | `src/middleware/error-handler.ts` |
| 7.4 | **Logging goes through the logger.** `logger.record(level, event, fields)`, with a dotted event name (`server.started`, `reminders.tick-failed`); no `console.*` in `src/` (`no-console`). No personal data (a client's phone or name) in a log line (REQ-NF-006). | `src/middleware/logger.ts` |
| 7.5 | **Domain decisions use the injected clock.** Whatever depends on "now" in the domain sense — booking windows, reminder due times, report periods — takes it from the request clock (`src/lib/clock.ts`, `app.locals.now`), so tests control it. Bookkeeping timestamps (`updatedAt` on a reference-data row, the log line's `ts`) are wall-clock by design and use `new Date()`. Formatting for the salon's zone goes through `src/lib/time.ts`. | `src/lib/`, `src/app.ts` |
| 7.6 | **Money is integer minor units** (kopiyky) plus a currency inside the code and the database (`*AmountMinor` columns); it becomes the contract's nested `Money` only in the view layer. | `src/db/schema.ts`, `src/modules/appointments/view.ts` |
| 7.7 | **Tests name their source.** A `describe` names the stage and the operation(s) or scenario it covers, and a test file's header comment names the REQ-IDs and SCN-IDs. | `tests/api/*` |

## 8. How to check

```bash
npm run lint           # ESLint: naming, language rules, TSDoc rules
npm run format:check   # Prettier: layout
npx tsc --noEmit       # the compiler's strict checks
```

`npm run format` rewrites the layout; `npx eslint . --fix` applies the
fixable lint rules. Both are allowed only in a commit that the full test suite
and the contract checks prove behaviour-neutral (SMS-54).

## 9. Deviations from the Google guide

| # | Google says | Here | Reason |
|---|---|---|---|
| D1 | 80-column lines | 100 | The code was written to about 100 columns: 1 707 lines exceed 80, 119 exceed 100. At 80, Prettier would re-break some 1 700 lines and bury every real change of SMS-54 under layout; at 100 the formatting commit stays reviewable. |
| D2 | `clang-format` as the formatter | Prettier | The JavaScript ecosystem's formatter; it integrates with ESLint through `eslint-config-prettier`. |
| D3 | No `any` anywhere | Allowed in tests for response bodies | §7.1. |
| D4 | JSDoc for every documented element | TSDoc tags, checked by `eslint-plugin-jsdoc` | TypeDoc (SMS-61) reads TSDoc; the tag set is the same for the tags this project uses. |

## 10. Change history

| Date | Change | Ticket |
|---|---|---|
| 2026-11-26 | First version. | SMS-53 |
| 2026-11-27 | §4.1: the audit reference and the catalog / catalogue rule. | SMS-59 |
