# Coding Agent — Claude Code

## Tool class
Agentic CLI coding tool. Semi-autonomous: applies file changes automatically,
runs the project's commands, and commits to the repository. The developer
reviews the result through the commit history and the gate records.

## Repository access method
- Runs on the developer's local machine (not a sandbox, not CI).
- Access is restricted to the project's working directory — files outside it
  are not readable.
- Git access is read-write: `git log`, `git diff`, `git status`, `git add`,
  `git commit`, and `git commit --amend` on an unpushed commit.
- No access to secrets or environment variables (`.env`, API keys, etc.).
- Network access is read-only (GET requests for documentation/reference
  info).

## Allowed operations
- Read and edit files within the working directory.
- Create new files.
- Delete existing files.
- Run tests, linters, project builds, and the project's own scripts.
- Commit to the repository, following the convention below.
- Sign gate records in `logs/gates/`.

## Forbidden operations
- `git push`, `git merge`, branch creation, and rewriting pushed history.
- Reading files outside the working directory.
- Installing programs on the system.
- Installing or updating project dependencies (`npm install`,
  `pip install`, etc.) — the agent only notifies the developer that this is
  needed; the developer installs manually.
- Reading or modifying secrets and environment variables.

## Audit and control
Change control is the commit history: every stage lands as `test:` → `gate:`
→ `feat:`, and the gate record in `logs/gates/` states what was verified and
how. The developer reviews through `git log` and the gate records.

## Commit message convention

SDD commit style (`spec:`, `test:`, `feat:`, `docs:`, `gate:`):
format `<prefix>: <short imperative summary>` in English, subject at most 72
characters, no body.
Full specification: `docs/commit-convention.md`.
When asked for a commit message, follow that document.
