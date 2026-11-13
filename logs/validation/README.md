# Validation package (SMS-48)

| File | Purpose |
|---|---|
| `checklist.md` | SCN-01 … SCN-15 with ready commands, expected values and the automated evidence for each |
| `bootstrap.mjs` | creates the two accounts the checklist logs in with (`admin-val`, `master-val`) in `DATABASE_URL`; refuses a `_test` database |
| `record-template.md` | the skeleton of the record plan §10 asks for — copy it to `YYYY-MM-DD-human-validation.md` and sign it |

**The validation itself has not been executed.** Plan §10 makes it a human act:
the scenarios run by hand, a fit-to-intent judgement against
`spec/DESCRIPTION.md` §2, and an assessment of whether the addendum was
justified. This package only makes that act possible without inventing commands.

Prepared 2026-11-13 by the coding agent; the signature line in the record is for
the validator.
