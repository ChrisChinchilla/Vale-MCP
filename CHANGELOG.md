# Changelog

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

