# Project history

A running log of decisions and non-obvious fixes, for Claude's own context
across sessions and machines. This is committed to git so it stays in sync
with the repo — unlike per-machine assistant memory. It's not a user-facing
changelog; see `CHANGELOG.md` for that.

Add an entry whenever you make a decision, work around something surprising,
or fix a bug whose cause wasn't obvious from the diff alone. Newest first.
Keep entries short — a few lines, not a report.

---

## 2026-08-25 — Set up project memory/history

Added this file plus root `CLAUDE.md` so project context and decisions
survive across machines via git, instead of living only in a given
developer's local Claude Code memory.

## 2025-11-09 — `check_text` doesn't use stdin

Vale has no `--stdin` flag/mode for JSON output the way the code initially
assumed. `checkText` in `src/vale-runner.ts` was sending `--stdin`, which
doesn't work — fixed to invoke `vale --output=JSON` without it.
**Why it matters:** if `check_text` needs revisiting (e.g. to lint text that
isn't already a file on disk), Vale will need a temp file or similar,
not stdin.

## Project refactor (v0.1.0)

Original single-file implementation was split into `types.ts` / `config.ts`
/ `vale-runner.ts` / `index.ts` for maintainability, and `check_file` /
`vale_status` / `vale_sync` replaced an earlier `style-text` /
`vale-config-info` tool pair. Full rationale in `CHANGELOG.md`.
