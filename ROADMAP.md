# Roadmap

Ranked by value for effort. Based on a read of `src/` as of v0.1.0.

## 1. Security (do first) — done on branch `security/hardening`

- [x] **Shell injection in `vale-runner.ts`.** Every call uses `exec()` with an
      interpolated string (`--config="${configPath}"`, `"${absolutePath}"`).
      `config_path` and `path` come from the model/user, so a `"` or `$(...)`
      in them runs arbitrary commands. Switch to `execFile("vale", [args])`
      (no shell) — it also removes quoting bugs on paths with spaces/quotes.
- [x] **Dependency vulnerabilities.** `npm audit --omit=dev` reports 9
      (1 critical `proxy-addr`, highs in `@modelcontextprotocol/sdk` <=1.31,
      `zod` <4.6.6, `body-parser`, `fast-uri`). Bump SDK 1.30 → 1.32.2 and zod
      → 4.6.7 (both in range), then `npm audit fix`. Check the SDK
      `outputSchema` draft-07 issue in `.claude/history.md` before re-enabling
      anything.
- [x] **Restrict file access.** `check_file` reads any path the client names.
      Optional `VALE_ALLOWED_ROOTS` env var; reject paths outside it
      (resolve symlinks with `realpath` first).
- [x] **Timeouts and output caps.** No `timeout`/`maxBuffer` on exec. Add a
      timeout (e.g. 60s) and a cap on `text` length so a huge input or hung
      `vale sync` can't wedge the server.
- [x] Add `.github/dependabot.yml` (npm + github-actions) and
      `npm audit --omit=dev` to CI.

## 2. Reliability and best practice

- [x] **Add a test suite** (currently none). `node:test` + a small fixture
      `.vale.ini`: JSON parsing, `normalizeIssues`, extension validation,
      config resolution, and an injection regression test.
- [x] **CI workflow for PRs**: `npm ci && npm run build` and fail if `build/`
      differs from a fresh build (it's committed and must stay in sync).
      The current `main.yml` only runs TODO-to-issue.
- [x] **Fix `--help`/`--version` output** — they print to stderr; users
      expect stdout (stderr is only required while serving MCP over stdio).
- [x] **Narrow `isStylesDirectoryError`.** The regex `Runtime error` /
      `does not exist` matches unrelated failures (e.g. a missing input file)
      and tells users to run `vale_sync`. Match Vale's `E100` code only.
- [x] **Vale version gate.** README says Vale >= 3.0 but nothing checks it;
      warn in `vale_status` if older.
- [ ] Drop `stripCodeFence` unless Vale really emits fences (looks like a
      leftover); remove dead `ValeSeverity`/unused exports if confirmed.
- [x] Bump `@types/node` (done: 24.19.2, matches engines >=22). Staying on
      TypeScript 5.9 (decision in history.md); `@types/node` 26 not needed.
- [ ] Re-test `outputSchema` once upstream SDK issues #2084/#2653/#2677 close.

## 3. Features

- [x] **`list_rules` / `explain_rule`**: wrap `vale ls-config` and
      `vale ls-vars`; lets an assistant explain *why* a rule fired.
- [x] **`check_directory` / glob**: lint many files in one call with a
      combined summary (Vale already accepts directories).
- [x] **Severity filter** (`min_alert_level`) and `max_issues` on check tools
      to keep results small in context.
- [x] **Suggested fixes**: expose `Action` data (Vale's `suggest` actions)
      in `structuredContent` so clients can offer one-click replacements.
- [x] **MCP resources/prompts**: `vale://config` resource; `fix_style_issues`,
      `review_text`, `explain_style_rule` prompts.
- [x] **Vale in `vale_status`**: show active config path and installed
      packages (what `valeConfigPath` resolved to) — currently only in logs.
- [ ] Windows support check: `execFile` change plus `vale.exe` lookup.

## 4. Distribution and docs

- [x] First npm publish and release workflow (done: 0.2.0 manual, 0.2.1 via OIDC).
- [x] Release process: `.claude/skills/release` (version bump, CHANGELOG,
      release PR, GitHub Release -> publish workflow, verification). The
      publish workflow now fails if the tag doesn't match `package.json`.
- [ ] Submit to the MCP registry and add `server.json` / `mcpName` once
      published under the final package name.
- [x] README: fix the `@iflow-mcp/...` install line (third-party mirror).
      (`vale-mcp` bin alias added alongside `vale-cli`.)

## 5. Follow-ups from the hardening/feature PRs (#24, #25, #26)

Release steps (need the repo owner):

- [x] (done) Merge PRs in order: #24 → #25 → #26, retargeting each to `main` after
      the previous one merges. All three pass CI.
- [x] (done) Merge `ci/npm-publish` (release workflow); now uses npm trusted publishing, no token.
- [x] (done, manual) First publish of `vale-mcp` (npm returned 404 for `vale-mcp@latest`, the
      original bug). Check the name is free; if taken, use a scoped name and
      update README and install badges. Bump version for the release
      (hardening + new tool is at least 0.2.0) and move CHANGELOG
      "Unreleased" under it.

Test and CI gaps:

- [x] End-to-end tests through a real MCP client (`test/server.test.mjs`,
      SDK `Client` + `StdioClientTransport` against `build/index.js`): tool
      list, filters, `check_directory`, validation errors, `vale_sync` hint
      vs unrelated errors, `vale_sync` success, `VALE_ALLOWED_ROOTS` incl.
      `vale_sync`'s `config_path`.
- [x] Timeout kill path tested (`VALE_TIMEOUT_MS=1`); the maxBuffer overflow
      path shares the same branch but has no dedicated test.
- [ ] CI only runs Node 22 and Vale 3.27.0 (pinned URL in `ci.yml`). Add Node
      24 and a Vale-version matrix; bump the pin deliberately.
- [ ] `isStylesDirectoryError` keys on Vale 3.27.0's E201 wording; re-check on
      newer Vale (noted in history).
- [ ] `VALE_ALLOWED_ROOTS` doesn't constrain the working directory Vale
      searches for config from, or what `vale sync` downloads; only the file
      and `config_path` are checked.
- [ ] `check_directory` has no file-count cap beyond the 60s timeout and 10 MB
      output limit; consider a `--glob` input.
- [x] `list_rules`: block-scalar YAML values, `max_rules` cap, built-in
      `Vale.*` rules listed. Remaining: flow/multi-line quoted YAML values
      aren't parsed (no YAML library), and there's no offset/pagination.

Release follow-ups:

- [x] 0.2.0 is on npm (published manually after the CI EOTP failure; no
      provenance). Its GitHub release/tag was left as is.
- [x] Trusted publishing verified: 0.2.1 published via OIDC with provenance.
- [ ] Delete the unused `NPM_TOKEN` repo secret.
- [x] `npm deprecate vale-mcp@0.1.0` (done by the repo owner).
- [ ] Resources/prompts: add a rules resource or template (`vale://rules/{style}`)
      if clients want browsable rules; prompts are static text, so check
      real clients render the arguments sensibly (only tested via the SDK client).

## 6. Audit of `main` (2026-11-18, after PRs #37-#40)

Full-repo audit; findings numbered as reported. Each has a concrete failing
case. Not checked: Windows, Vale other than 3.27, how real MCP clients render
prompts, the readme and CI files beyond the quoted lines.

Must fix:

- [ ] **A1. Relative `config_path` breaks every tool.** Vale runs from the
      file's/config's/target dir, so `--config=fixtures/.vale.ini` is read
      from the wrong folder (`E100 ... does not exist`) in `list_rules`,
      `explain_rule`, `vale_sync`, `check_file`, `check_directory`,
      `check_text`. It also lets `VALE_ALLOWED_ROOTS` and Vale disagree on
      which file a relative path means (roots `/docs`, server cwd
      `/docs/proj/deep`, file in `/docs`, config `../../../outside.ini`).
      Fix: `path.resolve` the config path once before checking and passing it;
      add a relative-path test.

Should fix:

- [ ] **A2. "Vale not installed" is cached forever** (`checkValeInstalled`).
      Install Vale after the server starts and `vale_status` still says
      missing until restart, contradicting the startup message.
      `clearValeInstallCache` is never called. Fix: cache successes only.
- [ ] **A3. Error replies include `error.stack`** (absolute local paths) in
      every failure. Fix: only with `--debug`.
- [ ] **A4. Large directories fail with the wrong message and no results.**
      Vale output is capped at 10 MB; hitting it says "timed out or produced
      too much output", and `max_issues`/`min_severity` run after Vale has
      printed everything. Fix: separate maxBuffer message; pass
      `--minAlertLevel` to Vale when `min_severity` is set.

Nice to have:

- [ ] **A5.** `assertPathAllowed` wrongly denies folders named `..something`
      (`rel.startsWith("..")`); use `rel === ".." || rel.startsWith(".." + sep)`.
- [ ] **A6.** `publish.yml` interpolates `github.event.release.tag_name`
      straight into a shell line; pass it via `env:` instead (low risk: only
      release creators control it).
- [ ] **A7.** Delete dead code (~35 lines): `stripCodeFence`, unused
      `ValeError` type, the ASCII start-up banner in `main()`.
- [ ] **A8.** Merge the six copies of the "is Vale installed?" check in the
      tool handlers (`index.ts`) into one wrapper (~20 lines).

