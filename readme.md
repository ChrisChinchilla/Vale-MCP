# Vale MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that integrates [Vale](https://vale.sh/) prose linting into AI coding assistants like Claude Desktop, Cursor, and other MCP-compatible tools.

## Overview

This MCP server provides AI assistants with the ability to check files for style and grammar issues using Vale's powerful linting engine. It automatically discovers Vale configuration files and provides formatted, actionable feedback about writing quality.

## Features

- ✅ File linting: Check any text file for style issues with Vale
- 🔍 Smart configuration discovery: Automatically finds `.vale.ini` files using Vale's native upward search
- 🎯 Configuration priority: Supports `VALE_CONFIG_PATH` environment variable for explicit configuration
- 📊 Rich formatting: Returns markdown-formatted results with emojis and severity grouping
- 🛡️ Graceful degradation: Provides helpful installation guidance when Vale isn't installed
- 🐛 Debug mode: Optional debug logging for troubleshooting
- 📦 Style sync: Download Vale style packages with `vale_sync` tool

## System requirements

- **Node.js:** Version 22 or higher
- **Vale:** Version 3.0 or higher

## Installation

### Build from source

```bash
# Clone or navigate to the project directory
cd Vale-MCP

# Install dependencies
npm install

# Build the TypeScript project
npm run build
```

### Install globally (recommended for most users)

Installing globally creates a `vale-cli` command available system-wide:

```bash
# From the Vale-MCP directory
npm run install:global
```

This creates a global `vale-cli` command that you can use from anywhere, making it easy to configure in AI assistants.

To uninstall:

```bash
npm run uninstall:global
```

**Note:** If you're actively developing and making changes, you can skip global installation and use the absolute path to `build/index.js` instead (see integration examples below).

## Using with AI assistants

AI coding assistants that support the MCP standard can integrate the Vale MCP server.

### Claude Desktop

Add the Vale MCP server to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vale": {
      "command": "vale-cli",
      "args": []
    }
  }
}
```

For debug mode:

```json
{
  "mcpServers": {
    "vale": {
      "command": "vale-cli",
      "args": ["--debug"]
    }
  }
}
```

Restart Claude Desktop after updating the configuration.

### VS Code (GitHub Copilot)

You can add the Vale MCP server to VS Code in two ways:

#### Option A: Command Palette (easiest)

1. Open the Command Palette: Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Run: Type `MCP: Add Server` and select it
3. Provide server information:
   - **Name:** `vale` (or any name you prefer)
   - **Type:** Select `stdio`
   - **Command:** `vale-cli` (if installed globally) or `node`
   - **Arguments:**
     - If using `vale-cli`: Leave empty or add `--debug`
     - If using `node`: Add the path like `/Users/fabri/repos/FrankenMCP/Vale-MCP/build/index.js`
4. Choose scope: User configuration (global) or Workspace (project-specific)

#### Option B: Manual configuration

Add to your VS Code settings file:

**Using global install:**

```json
{
  "github.copilot.chat.mcp.servers": {
    "vale": {
      "command": "vale-cli",
      "args": []
    }
  }
}
```

**Using absolute path (no global install needed):**

```json
{
  "github.copilot.chat.mcp.servers": {
    "vale": {
      "command": "node",
      "args": ["/absolute/path/to/Vale-MCP/build/index.js"]
    }
  }
}
```

**With debug mode:**

```json
{
  "github.copilot.chat.mcp.servers": {
    "vale": {
      "command": "vale-cli",
      "args": ["--debug"]
    }
  }
}
```

**Verify in VS Code:**

- Open GitHub Copilot Chat
- Type `/mcp` to see available MCP tools
- The Vale tools should appear in the list

### Cursor

Add to your Cursor MCP settings (follow [Cursor's MCP documentation](https://docs.cursor.com/advanced/model-context-protocol)):

**Using global install:**

```json
{
  "mcpServers": {
    "vale": {
      "command": "vale-cli"
    }
  }
}
```

**Using absolute path:**

```json
{
  "mcpServers": {
    "vale": {
      "command": "node",
      "args": ["/absolute/path/to/Vale-MCP/build/index.js"]
    }
  }
}
```

### Using a specific Vale configuration

You can specify a Vale configuration file using the `VALE_CONFIG_PATH` environment variable:

```json
{
  "mcpServers": {
    "vale": {
      "command": "vale-cli",
      "env": {
        "VALE_CONFIG_PATH": "/path/to/your/.vale.ini"
      }
    }
  }
}
```

## Usage examples

Once configured, you can ask your AI assistant to:

- "Check docs/guide.md using Vale"
- "Lint this markdown file for style issues"
- "What style issues does Vale find in README.md?"
- "Run `vale_sync` to download the style packages"
- "Is Vale installed on this system?"

## Available tools

The server provides three MCP tools:

### `vale_status`

Check if you have installed Vale and can access it.

**Returns:**

- Installation status (installed/not installed)
- Vale version (if installed)
- Platform-specific installation instructions (if not installed)

**Example usage in AI:**

> "Is Vale installed on this system?"

### `vale_sync`

Download Vale styles and packages by running `vale sync`. Use this when you encounter errors about missing styles directories.

**Parameters:**

- `config_path` (optional): Path to `.vale.ini` file. If not provided, uses the server's configured path or searches in the current directory.

**Returns:**

- Success/failure status
- Output from the sync operation
- Helpful error messages if sync fails

**When to use:**

- When you see E100 errors: `"The path '/path/to/styles' does not exist"`
- After creating or updating a `.vale.ini` file
- When adding new packages to your Vale configuration

**Example usage in AI:**

> "Run `vale_sync` to download the required styles"

### `check_file`

Lint a file at a specific path against Vale style rules.

**Parameters:**

- `path` (required): Absolute or relative path to the file

**Returns:**

- Formatted markdown with issues grouped by severity
- Detailed issue information (line, column, rule, message, suggestion)
- Summary statistics (errors, warnings, suggestions)
- Structured metadata for programmatic access

**Example usage in AI:**

> "Check the README.md file for style issues"

## Command-line options

```bash
vale-cli [options]

Options:
  --debug, --verbose, -v    Enable debug logging
  --help, -h                Show help message
  --version                 Show version number
```

## Configuration

The server searches for Vale configuration in the following order:

1. **Per-file:** Configuration discovered from file's directory (for `check_file` tool)
2. **Server-wide:** `VALE_CONFIG_PATH` environment variable
3. **Working directory:** `.vale.ini` in `process.cwd()`
4. **Vale defaults:** Global configuration or built-in rules

### Example .vale.ini

```ini
StylesPath = styles
Packages = write-good, proselint

[*]
BasedOnStyles = write-good, proselint
```

For more information about Vale configuration, see the [Vale documentation](https://vale.sh/docs/topics/config/).

## Development

### Project structure

```
Vale-MCP/
├── src/
│   ├── index.ts         # Main MCP server
│   ├── vale-runner.ts   # Vale execution wrapper
│   ├── config.ts        # Configuration management
│   └── types.ts         # TypeScript type definitions
├── build/               # Compiled JavaScript (generated)
├── package.json         # Node.js package configuration
├── tsconfig.json        # TypeScript compiler configuration
└── readme.md           # This file
```

### Building for development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch for changes
npm run watch

# Run the server directly
npm start
```

### Linting

```bash
# TypeScript compilation check
npx tsc --noEmit

# Strict unused code check
npx tsc --noUnusedLocals --noUnusedParameters --noEmit
```

## Troubleshooting

### Vale not found

If you see errors about missing Vale installation:

**macOS:**

```bash
brew install vale
```

**Linux:**

```bash
sudo snap install vale
```

**Windows:**

```bash
choco install vale
# or
scoop install vale
```

### Missing styles directory (E100 errors)

If you see errors like "The path '/path/to/styles' does not exist":

1. Make sure you have a `.vale.ini` file in your project
2. Run the `vale_sync` tool through your AI assistant
3. Or manually run: `vale sync`

### Debug mode

Enable debug mode to see detailed logging:

```json
{
  "mcpServers": {
    "vale": {
      "command": "vale-cli",
      "args": ["--debug"]
    }
  }
}
```

Check the MCP server logs in your AI assistant for detailed information.

## Credits

Created by Chris Chinchilla.

## License

MIT License - see LICENSE file for details.
