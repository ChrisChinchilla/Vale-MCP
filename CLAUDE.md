# Vale MCP Server

MCP (Model Context Protocol) server that exposes [Vale](https://vale.sh/) prose
linting to AI coding assistants (Claude Desktop, Cursor, etc.) over stdio.

## Architecture

- `src/index.ts` — MCP server entry point, built on the high-level `McpServer`
  API (`registerTool`, zod input/output schemas — not the low-level `Server`
  class, which the SDK now marks `@deprecated` for anything but advanced use
  cases). Handles CLI flags (`--debug`, `--help`, `--version`) and resolves
  the active `.vale.ini` on startup.
- `src/vale-runner.ts` — shell wrapper around the `vale` binary: install
  detection, `check_file`, `check_text`, `vale sync`.
- `src/config.ts` — config discovery/loading (`VALE_CONFIG_PATH` env var,
  upward search for `.vale.ini`).
- `src/types.ts` — shared TypeScript types.
- Build output goes to `build/` (compiled JS is committed — the `bin` entry
  point `vale-cli` points at `build/index.js`).

### Tools exposed

- `vale_status` — check Vale is installed, with platform install instructions.
- `vale_sync` — run `vale sync` to download style packages (fixes E100 errors).
- `check_file` — lint a file path.
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

No test suite currently exists.

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
