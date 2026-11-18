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
- [ ] **Fix `--help`/`--version` output** — they print to stderr; users
      expect stdout (stderr is only required while serving MCP over stdio).
- [ ] **Narrow `isStylesDirectoryError`.** The regex `Runtime error` /
      `does not exist` matches unrelated failures (e.g. a missing input file)
      and tells users to run `vale_sync`. Match Vale's `E100` code only.
- [ ] **Vale version gate.** README says Vale >= 3.0 but nothing checks it;
      warn in `vale_status` if older.
- [ ] Drop `stripCodeFence` unless Vale really emits fences (looks like a
      leftover); remove dead `ValeSeverity`/unused exports if confirmed.
- [ ] Bump `@types/node`; stay on TypeScript 5.9 (decision in history.md).
- [ ] Re-test `outputSchema` once upstream SDK issues #2084/#2653/#2677 close.

## 3. Features

- [ ] **`list_rules` / `explain_rule`**: wrap `vale ls-config` and
      `vale ls-vars`; lets an assistant explain *why* a rule fired.
- [ ] **`check_directory` / glob**: lint many files in one call with a
      combined summary (Vale already accepts directories).
- [ ] **Severity filter** (`min_alert_level`) and `max_issues` on check tools
      to keep results small in context.
- [ ] **Suggested fixes**: expose `Action` data (Vale's `suggest` actions)
      in `structuredContent` so clients can offer one-click replacements.
- [ ] **MCP resources/prompts**: expose the active `.vale.ini` as a resource;
      add a "fix all issues in this file" prompt.
- [ ] **Vale in `vale_status`**: show active config path and installed
      packages (what `valeConfigPath` resolved to) — currently only in logs.
- [ ] Windows support check: `execFile` change plus `vale.exe` lookup.

## 4. Distribution and docs

- [ ] First npm publish, then merge the release workflow (`ci/npm-publish`).
- [ ] Update `CHANGELOG.md` per release; consider `npm version` + release
      notes automation (e.g. `gh release create --generate-notes`).
- [ ] Submit to the MCP registry and add `server.json` / `mcpName` once
      published under the final package name.
- [ ] README: fix the `@iflow-mcp/...` install line (third-party mirror) and
      the `vale-cli` vs `vale-mcp` bin naming confusion — add a `vale-mcp`
      bin alias alongside `vale-cli`.
