# Vale MCP Server

MCP (Model Context Protocol) server that exposes [Vale](https://vale.sh/) prose
linting to AI coding assistants (Claude Desktop, Cursor, etc.) over stdio.

## Architecture

- `src/index.ts` — MCP server entry point, built on the high-level `McpServer`
  API (`registerTool`, zod input/output schemas — not the low-level `Server`
  class, which the SDK now marks `@deprecated` for anything but advanced use
  cases). Handles CLI flags (`--debug`, `--help`, `--version`) and resolves
  the active `.vale.ini` on startup.
- `src/vale-runner.ts` — wrapper around the `vale` binary (always `execFile`,
  never a shell string — see history): install
  detection, `check_file`, `check_text`, `vale sync`. Vale runs with a
  different cwd than the server, so any path passed to it (especially
  `config_path`) must be made absolute first.
- `src/config.ts` — config discovery/loading (`VALE_CONFIG_PATH` env var,
  upward search for `.vale.ini`) and `assertPathAllowed` (`VALE_ALLOWED_ROOTS`).
- `src/types.ts` — shared TypeScript types.
- Build output goes to `build/` (compiled JS is committed — the `bin` entry
  point `vale-cli` points at `build/index.js`).

### Resources and prompts

- Resource `vale://config` — the active `.vale.ini` (uses `valeConfigPath`,
  checked with `assertPathAllowed`).
- Prompts `fix_style_issues`, `review_text`, `explain_style_rule` — plain
  instruction templates that tell the assistant which tools to call; they
  contain no logic, so keep tool names in them in sync with the tools.

### Tools exposed

- `vale_status` — check Vale is installed, with platform install instructions.
- `vale_sync` — run `vale sync` to download style packages (fixes E201 missing-style errors).
- `check_file` — lint a file path.
- `vale_status` also reports config path / packages / installed styles via
  `getValeSetup` (best-effort, never fails the status call).
- `list_rules` / `explain_rule` — read rule YAML from the StylesPath dirs that
  `vale ls-config` reports (Vale has no "list rules" command). `explain_rule`
  only accepts `Style.Rule` names matching a segment whitelist (path-traversal
  guard) and both honour `VALE_ALLOWED_ROOTS`.
- `check_directory` — lint a directory recursively; issues carry their `file`.
  `check_file`/`check_text`/`check_directory` share `min_severity`/`max_issues`
  filters (applied in `buildResult`, not via Vale's `--minAlertLevel`).
- `check_text` — lint a text string directly. Note: Vale has no stdin support
  for this — see history entry below before changing it.

### Config resolution priority

1. Per-file discovery from the file's own directory (`check_file`)
2. `VALE_CONFIG_PATH` env var
3. `.vale.ini` in `process.cwd()`
4. Vale's own defaults / upward search

## Commands

```bash
npm run build          # tsc + chmod the built entry point executable
npm run watch           # tsc --watch
npm start                # run build/index.js
npm run install:global  # npm link, exposes `vale-cli` globally
```

`npm test` builds and runs `test/*.test.mjs` against `build/` (needs `vale` on
PATH). `test/runner.test.mjs` covers `vale-runner.ts` directly;
`test/server.test.mjs` spawns the built server and calls tools through the real
MCP client, so new tools/inputs in `src/index.ts` should get a test there. CI also fails if `build/` differs from a fresh build.

## Conventions

- TypeScript, ES modules (`"type": "module"` — use `.js` extensions in
  relative imports, per NodeNext resolution).
- Requires Node >= 22 and Vale >= 3.0 (see readme.md for install docs).
- `build/` is committed to the repo (it ships via `files` in package.json) —
  keep it in sync with `src/` when committing source changes.
- Release-facing changes go in `CHANGELOG.md`. Project-internal reasoning,
  decisions, and session history go in [.claude/history.md](.claude/history.md)
  — check it before touching `check_text`/stdin handling or config discovery,
  both of which have already had non-obvious fixes.
