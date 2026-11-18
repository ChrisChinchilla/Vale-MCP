# Project history

A running log of decisions and non-obvious fixes, for Claude's own context
across sessions and machines. This is committed to git so it stays in sync
with the repo — unlike per-machine assistant memory. It's not a user-facing
changelog; see `CHANGELOG.md` for that.

Add an entry whenever you make a decision, work around something surprising,
or fix a bug whose cause wasn't obvious from the diff alone. Newest first.
Keep entries short — a few lines, not a report.

---

## 2026-11-18 — 0.2.0 published manually; 0.2.1 tests the OIDC workflow

After the EOTP failure the user published 0.2.0 by hand (from the release PR
commit; same content as the tagged merge commit), so tag/release recreation
was dropped. 0.2.1 is a no-code patch release whose purpose is to exercise
the trusted-publishing workflow end to end. If it fails, see the release
skill's failure section; a workflow fix needs a new tag (0.2.2), since
versions can't be republished.

## 2026-11-18 — First release run failed: EOTP

The v0.2.0 release was created by hand-off after the PR merged (no release
existed at first: merging the release PR doesn't publish, creating the GitHub
Release does). `publish.yml` ran, built and signed provenance, then `npm
publish` failed with `EOTP`: the `NPM_TOKEN` secret requires a 2FA code,
which CI can't supply. Resolved by moving to npm trusted publishing (OIDC): `publish.yml` no longer
uses `NPM_TOKEN`, runs Node 24 (npm >= 11.5.1 is required), and
`package.json` `repository.url` was corrected to the exact repo casing
(`ChrisChinchilla/Vale-MCP`) since npm matches it against the OIDC claims.
Gotcha: a `release`-triggered workflow runs the file as of the *tag*, so
re-running the failed v0.2.0 run still uses the old token-based workflow.
The `NPM_TOKEN` secret is now unused and can be deleted.

## 2026-11-18 — Release 0.2.0 and the release skill

npm had only the manual 0.1.0 (pre-hardening code, still shell-injectable),
so 0.2.0 was cut as the first release through the automated path. Added
`.claude/skills/release/SKILL.md` documenting the flow (release PR → user
merges → `gh release create` → publish workflow → verify) and a
tag-vs-`package.json` check in `publish.yml`. 0.1.0 on npm is vulnerable;
consider `npm deprecate vale-mcp@0.1.0 "Upgrade to >=0.2.0 (security fix)"`
once 0.2.0 is live (needs npm login, user's call).

## 2026-11-18 — main CI broke: Dependabot TS 7 + @types/node 26

Merging Dependabot's TypeScript 7.0.2 and @types/node 26 PRs together left
`package.json` invalid (missing comma between devDependencies), so `npm ci`
failed on main. Separately, PR #31 alone already failed: with TS 7 `tsc`
couldn't find Node types (`Cannot find name 'fs'`). Reverted to
typescript ^5.9.3 and @types/node ^24 (matches `engines` >=22) and added
Dependabot `ignore` rules for major bumps of both. To adopt TS 7 later: add
`"types": ["node"]` to tsconfig, confirm `build/` output is byte-identical
(CI checks it) and test on Node 22. Lesson: when merging several Dependabot
PRs that touch the same file, re-check `package.json` and CI after the second.

## 2026-11-18 — CI failed: `node --test test/` on Node 22

`npm test` passed locally (newer Node) but failed in CI on Node 22:
`node --test test/` treats `test/` as a module path there
(MODULE_NOT_FOUND). Fixed with an explicit quoted glob,
`node --test "test/*.test.mjs"` (Node's own glob; works without shell
expansion, so also on Windows). Local Node is newer than CI/engines, so
test-script changes need a CI run, not just a local one. Open work is tracked
in ROADMAP.md section 5.

## 2026-11-18 — check_directory, filters, suggested fixes

`min_severity`/`max_issues` are applied in `buildResult` after parsing rather
than via Vale's `--minAlertLevel`, so `summary` can reflect the filtered set
while `truncated` flags a `max_issues` cut (summary.total stays the
untruncated-but-filtered count). `check_directory` runs Vale with cwd = the
directory so config search starts there. Vale only populates `Action` when
the rule YAML declares `action:` — an empty `Name` means "no fix", so it's
normalized to `undefined`. Not done: `list_rules`/`explain_rule`
(`vale ls-config`) — still on ROADMAP.

## 2026-11-18 — Vale reports errors as JSON on stdout (E201), not E100

Vale 3.27 prints config/runtime errors as a single JSON object
(`{Line, Path, Text, Code, Span}`) on stdout with exit 2 — not the
`{file: [issues]}` map. The old code fed that into `normalizeIssues` and
died with "not iterable", and `isStylesDirectoryError`'s E100 match never
fired. `parseValeOutput` now detects the object and throws `Code: Text`.
Missing style / StylesPath is **E201**; E100 is e.g. a nonexistent `--config`
(sync can't fix that), so only `E201.*StylesPath` triggers the `vale_sync`
hint. Observed on 3.27.0 only — re-check if Vale changes its codes.

## 2026-11-18 — Security hardening: execFile, limits, allowed roots

Audit found `vale-runner.ts` built every command as an interpolated string
for `exec()`, so client-supplied `path`/`config_path`/`text_file_ext` could
inject shell commands. Replaced with a single `runVale(args, opts)` helper
over `execFile` (no shell). Rules going forward: never build a command
string; pass `--config=${p}` as one arg; resolve file paths to absolute
before passing (a leading `-` would otherwise read as a flag).
- `runVale` returns stdout even on non-zero exit (Vale exits non-zero when it
  finds issues) but rejects if the process was killed (timeout/maxBuffer).
- Limits: 60s timeout (300s for sync), 10 MB output, 1 MB `check_text` input.
- `VALE_ALLOWED_ROOTS` (opt-in, default unrestricted to keep existing setups
  working) checked via `assertPathAllowed` with `realpath`, so symlinks can't
  escape; applied to `check_file` path and every `config_path`.
- Deps: SDK 1.30 → 1.32.2, zod 4.4 → 4.6.7 (audit: 9 vulns → 0). Added tests
  (`test/`), CI (`ci.yml`) and Dependabot. See ROADMAP.md for what's left.

## 2026-08-25 — Dropped outputSchema: SDK emits invalid draft-07 dialect

Claude Desktop rejected `check_text` calls: "the tool's output schema uses
an old JSON Schema draft-07 dialect that the connector can't validate."
Root cause is an SDK bug, not our code — `McpServer`'s `tools/list` handler
calls its Zod→JSON-Schema converter without a `target` option, so it always
emits `$schema: draft-07` even though the MCP spec (SEP-1613) requires
2020-12. Confirmed via `gh issue view 2084` on
modelcontextprotocol/typescript-sdk — still open as of SDK 1.30.0 (also
tracked in #2653, #2677). No public option on `registerTool`/`McpServer` to
override the dialect.

**Fix:** removed the `outputSchema` declaration from `check_file` and
`check_text`. The result still returns `structuredContent` — the SDK's
`validateToolOutput` only validates/requires it when `outputSchema` is
declared, so dropping the schema keeps the structured payload but sidesteps
the broken dialect tag entirely. `inputSchema` still carries the same
draft-07 mislabel, but Claude Desktop's connector didn't reject invocation
over it, only the output.
**Why it matters:** don't re-add `outputSchema` to these tools until the
upstream issues above are closed and the SDK is bumped past whatever version
fixes them — check the issue state first, since re-adding it will
reintroduce this exact failure.

## 2026-08-25 — Dependency bump + migrate to McpServer

Bumped `@modelcontextprotocol/sdk` 1.20.2 → 1.30.0 and `@types/node`/
`typescript` to their latest patch within the existing major (checked via
`gh api repos/modelcontextprotocol/typescript-sdk/releases` for breaking
changes between those versions — none affecting this project's usage).

Declined the TypeScript 7 major bump (still young, new Go-based compiler,
low payoff for this project's size) — stayed on 5.9.x.

Rewrote `src/index.ts` from the low-level `Server` + manual
`CallToolRequestSchema`/`ListToolsRequestSchema` handlers to `McpServer` +
`registerTool()`, because the SDK's own JSDoc now marks `Server` as
`@deprecated` outside "advanced use cases." Net effect:
- Input validation (`path`, `text`, `config_path`) is now zod-schema driven
  instead of manual `if (!x)` checks.
- Tool results use the spec's `structuredContent` field (with a declared
  `outputSchema`) instead of the non-standard `_meta.structured_data` the
  code used before.
- Added `annotations` (`readOnlyHint` etc.) per tool — new-ish SDK feature,
  informational only, no behavior change.
**Why it matters:** if you add a 5th tool, follow the `registerTool` pattern,
not the old switch-statement style — there's no `TOOLS` array or `default:`
case to update anymore.

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
