# Changelog

## Unreleased

### Added

- **MCP resource `vale://config`:** the active `.vale.ini`.
- **MCP prompts:** `fix_style_issues`, `review_text` and `explain_style_rule`.

- **`list_rules` tool:** lists the rules of the styles the active config uses,
  with level, check type, message and enabled/disabled state per config section.
- **`explain_rule` tool:** returns one rule's YAML definition and where it is
  active, given its `Style.Rule` name from a lint result.

## Version 0.2.1 - Publishing via npm trusted publishing (2026-11-18)

### Changed

- Releases are now published from GitHub Actions using npm trusted publishing
  (OIDC, with provenance), replacing the manual publish used for 0.2.0. No
  functional changes to the server.
- `package.json` `repository.url` corrected to the exact repo casing.

## Version 0.2.0 - Security hardening and new tools (2026-11-18)

### Security

- **Fixed shell injection:** Vale is now run with `execFile` and an argument
  array instead of `exec` with an interpolated command string. Previously a
  crafted `path`, `config_path` or `text_file_ext` could run arbitrary shell
  commands.
- **Updated dependencies** (`@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7,
  and transitive fixes); `npm audit` now reports 0 vulnerabilities.
- **Added limits:** 60 second timeout on Vale runs (5 minutes for
  `vale_sync`), 10 MB output cap, and 1 MB cap on `check_text` input.

### Fixed

- Vale config errors (e.g. a style missing from `StylesPath`, code E201) were
  reported as a confusing "not iterable" failure; they now surface as
  `E201: <Vale's message>`, and only these trigger the "run `vale_sync`"
  guidance (previously any "does not exist" error did).
- `--help` and `--version` print to stdout instead of stderr.

### Added

- **`check_directory` tool:** lint a directory recursively with a combined
  summary; each issue includes its `file`.
- **`min_severity` and `max_issues` inputs** on `check_file`, `check_text` and
  `check_directory`. Results report `truncated` when `max_issues` cut them off.
- **Suggested fixes:** issues include Vale's `action` (e.g. `replace` with
  candidates) when the rule defines one.
- `vale-mcp` bin alias, so `npx vale-mcp` and `vale-mcp` after a global
  install work (`vale-cli` still works).
- `vale_status` warns when the installed Vale is older than 3.0.
- `VALE_ALLOWED_ROOTS` environment variable to restrict which files and
  config paths the tools may access (symlinks are resolved).
- Test suite (`npm test`, uses `node:test` and the installed `vale`).
- CI workflow (tests, `npm audit`, check that `build/` matches `src/`) and
  Dependabot config.

## Version 0.1.0 - Major refactoring and improvements

### Added

- **Modular architecture:** Split code into separate modules for better maintainability:
  - `src/types.ts` - TypeScript type definitions
  - `src/config.ts` - Configuration management
  - `src/vale-runner.ts` - Vale execution wrapper
  - `src/index.ts` - Main MCP server

- **New tools:**
  - `vale_status` - Check Vale installation with platform-specific instructions
  - `vale_sync` - Download Vale style packages to fix E100 errors
  - `check_file` - Lint files with rich markdown output (replaces `style-text`)

- **CLI options:**
  - `--debug` / `--verbose` / `-v` - Enable debug logging
  - `--help` / `-h` - Show help message
  - `--version` - Show version number

- **Enhanced error handling:**
  - Graceful degradation when Vale is not installed
  - Platform-specific installation instructions (macOS, Linux, Windows)
  - E100 error detection with helpful guidance
  - Vale installation result caching

- **Rich output formatting:**
  - Markdown-formatted results with emojis
  - Severity grouping (errors, warnings, suggestions)
  - Summary statistics
  - Structured metadata for AI consumption

- **Configuration enhancements:**
  - `VALE_CONFIG_PATH` environment variable support
  - Smart config file discovery with priority ordering
  - Config file validation
  - Better default handling with clear warnings

- **Package improvements:**
  - Added keywords for discoverability
  - New scripts: `watch`, `start`, `install:global`, `uninstall:global`
  - Node.js engine requirement (>=22.0.0)
  - License updated to MIT
  - Repository information

- **TypeScript improvements:**
  - Declaration files generation
  - Source maps for better debugging
  - JSON module resolution

- **Documentation:**
  - Comprehensive README with usage examples
  - Tool descriptions with parameters
  - Configuration guide
  - Troubleshooting section
  - Development instructions

### Changed

- Switched from `McpServer` to `Server` class from MCP SDK
- Use `CallToolRequestSchema` and `ListToolsRequestSchema` for handlers
- Improved async/await patterns throughout
- Better startup output with ASCII box
- Enhanced debug logging with timestamps

### Removed

- `style-text` tool (replaced by more useful `check_file`)
- `vale-config-info` tool (functionality merged into `vale_status`)
- `zod` dependency (no longer needed with new architecture)

### Benefits

- **Better maintainability:** Modular code is easier to understand and modify
- **Enhanced user experience:** Rich output, helpful errors, graceful failures
- **More useful tools:** File-based linting and style syncing vs. text strings
- **Professional quality:** CLI options, caching, proper config handling
- **Better for AI assistants:** Clear tool descriptions and structured output

