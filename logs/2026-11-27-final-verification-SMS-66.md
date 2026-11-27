# Final verification of the repository (SMS-66)

| | |
|---|---|
| Ticket | SMS-66 (lab 6, step 13) |
| Commit verified | `e2b7ef2` (every check below ran on this tree, after a fresh `npm ci`) |
| Environment | Node 24.22.3, PostgreSQL 16, Chromium headless 158 (the agent's container) |
| Date | 2026-11-27 |

Lab 6 step 13: the current implementation passes its tests, the documentation
matches the code, and known deviations from the specification are absent or
documented.

## 1. Every check, on one tree

| Check | Command | Result |
|---|---|---|
| Dependencies from the lockfile | `npm ci` | 350 packages |
| Build (contract → validators → server → interface) | `npm run build` | ok |
| Types — server, browser code, browser tests | `tsc --noEmit` × 3 projects | 0 errors |
| Coding convention | `npm run lint` | 0 errors, 0 warnings (doc comments required) |
| Layout | `npm run format:check` | clean |
| API and acceptance tests | `npm test` | **420 / 420** in 30 files |
| … in a random order | `vitest run --sequence.shuffle` × 2 | 420 / 420, 420 / 420 |
| Interface in a browser | `npm run test:ui` × 2 | **51 / 51**, 51 / 51 |
| Test before implementation | `npm run check:test-first` | 30 / 30 entries |
| User guide against the interface | `npm run check:user-guide` | 133 / 133 labels and messages |
| Traceability | `npm run check:traceability` | 43 requirements, 0 findings |
| Contract | `npm run lint:contract`, `verify:contract` | valid; 50 operations |
| References up to date | `npm run docs`, then `git status` | 0 files changed |
| Production dependencies | `npm audit --omit=dev` | 0 vulnerabilities |

A first run of the suite reported "420 skipped": the database cluster had been
stopped by the container's restart. It was started and the suite re-run; a
skipped run is not counted as a pass.

## 2. Documentation against the code

Closed by SMS-64 (`logs/docs-check/2026-11-27-documentation-check.md`): the
README passes from a clean clone in the agent's run and the developer's
(curl 22 / 22); 50 / 50 operations match the code; the user guide matches the
interface (133 / 133, and the developer's walk-through). Nothing in that
check is open.

## 3. Known deviations — each documented where a reader meets it

| # | Deviation | Why it stands | Documented in |
|---|---|---|---|
| 1 | **SMS delivery is simulated**: a `sent` row means "handed to the channel"; no text reaches a phone | REQ-NF-009 excludes external integrations; the dispatcher is the seam for a real channel | README "Limits"; user guide §6; lab 5 FINAL-GATE §5 |
| 2 | **The `failed` notification status is never produced** | follows from 1; kept reserved in the contract (developer's decision, option a) | CL-13; README "Limits"; user guide §5.3 |
| 3 | **Reminders are sent by a 60 s process tick**; a reminder is sent at the first tick at or after its time; one instance assumed | lab 5 stage R; multi-instance would need a leader | README "Limits"; lab 5 FINAL-GATE §5 |
| 4 | **P11 answers 409, R21 answers 422** for the same collision | both declared by the contract; accepted in lab 5 | lab 5 FINAL-GATE §5 row 3 |
| 5 | **One addendum case (C8) is a characterisation test** that passed at red | the plan ordered the contract change before the test | `logs/gates/2026-11-13-test-SMS-45.md` §1.1 |
| 6 | **Date fields follow the browser's language** (`mm/dd/yyyy` or `dd.mm.yyyy`); every date the system shows is `Mon 16 Nov 2026` | developer's decision (option a): the native calendar kept | README "Limits"; user guide §6; G5 §5 |
| 7 | **The staff dashboard is tested at desktop width only** | UI-GATE U-5: REQ-NF-002's criterion names the client screens | README "Limits"; user guide §6 |
| 8 | **No password reset, no client accounts, one administrator** | SRS v1.3 glossary and constraints; REQ-F-017 | user guide §3, §6; README "The first administrator" |
| 9 | **The lab 5 control-run scripts in `logs/runtime/` are not in the repository** (git-ignored); the gate records quote their output | the runs are evidenced by `logs/runs/` and the records; the scripts were local tooling | README "Layout"; `docs/components.md` §2 row 17 |
| 10 | **13 moderate npm-audit findings, all in development tools** (drizzle-kit's esbuild; ESLint, typescript-eslint and TypeDoc through `minimatch`) | none runs in the server (`--omit=dev`: 0); esbuild's issue is its dev server, never started here; minimatch's needs a hostile glob, and the globs are the project's own config. npm's "fixes" are breaking (drizzle-kit **down** to 0.18.1) or newer than the project's two-week rule | this record; to be revisited when fixed versions are two weeks old |
| 11 | **`db:migrate`'s two success lines join** (`…successfully!db:migrate: …`) | drizzle-kit ends its line without a newline; both read | `logs/docs-check/…` §5.1 |
| 12 | **Performance under load and a security audit** were never in scope | stated so that a GO is not read wider than it is | lab 5 FINAL-GATE §5 row 6 |

**Corrected during lab 6 and no longer deviations:** the lab 5 FINAL-GATE's
claim that REQ-NF-002 was "closed outside this repository by SMS-36" (the
interface now exists — G5); the confirmation link to a placeholder host
(SMS-70); the administrator treated as a master (SMS-71/72); the README's
first run (SMS-74, 77, 78; F14, F15); the documents' wrong references (F9,
D1–D5).

## 4. Result

Every check passes on `e2b7ef2`. No deviation from the specification is
undocumented: each item of §3 is stated where a reader of the system meets it,
with its reason. Nothing blocks the final validation (SMS-67).
