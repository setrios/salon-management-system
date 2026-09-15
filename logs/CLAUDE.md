# Coding Agent — Claude Code

## Tool class
Agentic CLI coding tool. Semi-autonomous: applies file changes automatically,
without asking for human confirmation before each action, but has no
permission to commit or publish those changes to the repository.

## Repository access method
- Runs on the developer's local machine (not a sandbox, not CI).
- Access is restricted to the project's working directory — files outside it
  are not readable.
- Git access is read-only (`git log`, `git diff`, `git status`).
- No access to secrets or environment variables (`.env`, API keys, etc.).
- Network access is read-only (GET requests for documentation/reference
  info).

## Allowed operations
- Read and edit files within the working directory.
- Create new files.
- Delete existing files.
- Run tests, linters, and project builds — without restriction.
- View git history (log, diff, status).

## Forbidden operations
- Any non-idempotent git operations: commit, push, merge, branch creation.
- Reading files outside the working directory.
- Installing programs on the system.
- Installing or updating project dependencies (`npm install`,
  `pip install`, etc.) — the agent only notifies the developer that this is
  needed; the developer installs manually.
- Reading or modifying secrets and environment variables.

## Audit and control
No separate audit log of agent actions is kept. Change control is manual —
the developer reviews via `git diff` / `git status` before committing.
