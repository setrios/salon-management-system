# Commit Message Convention (SDD)

Source of truth for commit message style in this repository.
Linked from `AGENTS.md`. When asked to suggest a commit message,
the agent must follow this document.

## 1. Format

```
<prefix>: <short imperative summary>
```

- `prefix` — one of the prefixes from the table below, lowercase, followed by a colon and a space.
- `summary` — short (≤ 72 chars), in **English**, imperative mood, no trailing period.
- Body (optional) — blank line after the subject, then bullet list explaining *what* and *why*.
- One commit = one prefix. Pick the prefix of the dominant artifact.

Examples of good subjects:

```
spec: clarify booking reminder rules
test: cover free cancellation edge cases
feat: add master schedule lookup
docs: describe revenue report inputs
gate: accept appointment booking milestone
```

Bad examples (do not use):

```
Added stuff                    # no prefix
feat added schedule            # missing colon
SPEC: fix text                 # uppercase prefix
feat: fixed bug.               # past tense + trailing period
spec/test: update everything   # two prefixes
```

## 2. Prefixes

| Prefix | Meaning (SDD artifact / action) | Typical paths |
|--------|----------------------------------|---------------|
| `spec:` | Specification changes: requirements, SRS, domain decisions, `spec/` artifacts | `spec/**` |
| `test:` | Tests: new, updated, or removed tests and fixtures | `tests/**` |
| `feat:` | Implementation: production code, features, fixes in `src/` | `src/**` |
| `docs:` | Documentation outside `spec/`: `docs/`, README, guides | `docs/**`, `*.md` (except `spec/`) |
| `gate:` | SDD control points: reviews, acceptance decisions, quality gates, audit notes | `logs/**`, `docs/**` (decision records) |

Each prefix value must stay unambiguous: one prefix = one meaning.
Do not reuse an existing prefix with a different meaning.

## 3. Choosing the prefix

1. Identify the dominant artifact of the change (`spec/` → `spec:`, `tests/` → `test:`, `src/` → `feat:`, `docs/` → `docs:`, review/acceptance → `gate:`).
2. If a commit touches several areas, use the prefix of the primary intent and mention the rest in the body.
3. `gate:` is for the SDD action itself (approve, accept, verify), not for the code it verifies.

## 4. Extending the list

The list may be extended, but every new prefix must:

1. Be added to the table above with a unique meaning and typical paths.
2. Not overlap with an existing prefix's meaning.
3. Include one good example subject.

Unlisted prefixes are not allowed.
