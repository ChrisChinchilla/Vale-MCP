#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { checkValeInstalled, checkFile, checkText, syncValeStyles } from "./vale-runner.js";
import { loadConfig, verifyConfigFile, resolveConfigPath, findValeIniInWorkingDir, } from "./config.js";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const VERSION = packageJson.version;
// Parse command line arguments for debug mode
const args = process.argv.slice(2);
const DEBUG = args.includes("--debug") || args.includes("--verbose") || args.includes("-v");
// Show help and exit
if (args.includes("--help") || args.includes("-h")) {
    console.error(`
Vale MCP Server v${VERSION}

A Model Context Protocol server for Vale prose linting.

Usage:
  vale-cli [options]

Options:
  --debug, --verbose, -v    Enable debug logging
  --help, -h                Show this help message
  --version                 Show version number

The server communicates via stdio for MCP protocol.

Configuration priority:
  1. Per-file: Config discovered from file's directory (check_file)
  2. Server-wide: VALE_CONFIG_PATH environment variable
  3. Working directory: .vale.ini in process.cwd()
  4. Vale defaults: Global config or built-in rules

Environment variables:
  VALE_CONFIG_PATH    Path to specific .vale.ini file (overrides auto-detection)

Example:
  # Use specific config file
  VALE_CONFIG_PATH=/path/to/.vale.ini vale-cli

  # Enable debug logging
  vale-cli --debug

Documentation: https://vale.sh/docs/
`);
    process.exit(0);
}
// Show version and exit
if (args.includes("--version")) {
    console.error(VERSION);
    process.exit(0);
}
/**
 * Debug logger - only logs if DEBUG is enabled
 */
function debug(...args) {
    if (DEBUG) {
        console.error("[DEBUG]", new Date().toISOString(), ...args);
    }
}
// Server configuration
const config = loadConfig();
let valeConfigPath;
/**
 * Get platform-specific installation instructions for Vale
 */
function getInstallationInstructions() {
    const platform = process.platform;
    const instructions = {
        platform,
        documentation: "https://vale.sh/docs/vale-cli/installation/",
        methods: [],
    };
    switch (platform) {
        case "darwin":
            instructions.methods = [
                {
                    name: "Homebrew (recommended)",
                    command: "brew install vale",
                },
                {
                    name: "Download binary",
                    command: "Download from GitHub releases",
                    url: "https://github.com/errata-ai/vale/releases",
                },
            ];
            break;
        case "linux":
            instructions.methods = [
                {
                    name: "Snap",
                    command: "sudo snap install vale",
                },
                {
                    name: "Download binary",
                    command: "Download from GitHub releases and add to PATH",
                    url: "https://github.com/errata-ai/vale/releases",
                },
            ];
            break;
        case "win32":
            instructions.methods = [
                {
                    name: "Chocolatey",
                    command: "choco install vale",
                },
                {
                    name: "Scoop",
                    command: "scoop install vale",
                },
                {
                    name: "Download binary",
                    command: "Download from GitHub releases",
                    url: "https://github.com/errata-ai/vale/releases",
                },
            ];
            break;
        default:
            instructions.methods = [
                {
                    name: "Download binary",
                    command: "Download from GitHub releases",
                    url: "https://github.com/errata-ai/vale/releases",
                },
            ];
    }
    return instructions;
}
/**
 * Helper function to generate "Vale not installed" error response
 */
function createValeNotInstalledResponse() {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    error: "Vale is not installed or not found in PATH",
                    vale_required: true,
                    installation_instructions: getInstallationInstructions(),
                    message: "Please install Vale to use this feature. Vale is a command-line tool for prose linting.",
                }, null, 2),
            },
        ],
    };
}
/**
 * Check if an error is an E100 styles directory error
 */
function isStylesDirectoryError(errorMessage) {
    // E100 errors typically contain these patterns
    return /E100|does not exist|Runtime error/i.test(errorMessage);
}
// Initialize the MCP server
const server = new Server({
    name: "vale-mcp",
    version: VERSION,
}, {
    capabilities: {
        tools: {},
    },
});
// Define the available tools
const TOOLS = [
    {
        name: "vale_status",
        description: "Check if Vale (vale.sh) is installed and accessible. Use this first if other Vale tools fail. Returns installation status, version if available, and installation instructions for the current platform.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "vale_sync",
        description: "Download Vale styles and packages by running 'vale sync'. Use this when you see errors about missing styles directories (E100 errors like 'The path does not exist'). This command reads the .vale.ini configuration and downloads the required style packages.",
        inputSchema: {
            type: "object",
            properties: {
                config_path: {
                    type: "string",
                    description: "Optional path to .vale.ini file. If not provided, uses the server's configured path or searches in the current directory.",
                },
            },
        },
    },
    {
        name: "check_file",
        description: "Lint a file at a specific path against Vale style rules. Returns issues found with their locations and severity. If Vale is not installed, returns error with installation guidance.",
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Absolute or relative path to the file to check",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "check_text",
        description: "Lint text content directly against Vale style rules without requiring a file. Useful for checking text snippets, clipboard content, or dynamically generated content. Returns issues found with their locations and severity.",
        inputSchema: {
            type: "object",
            properties: {
                text: {
                    type: "string",
                    description: "The text content to check with Vale",
                },
            },
            required: ["text"],
        },
    },
];
// Handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS,
    };
});
// Handler for tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    debug(`Tool called: ${name}`, JSON.stringify(args, null, 2));
    try {
        switch (name) {
            case "vale_status": {
                debug("Checking Vale installation status...");
                const valeCheck = await checkValeInstalled();
                debug(`Vale installed: ${valeCheck.installed}, version: ${valeCheck.version}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                installed: valeCheck.installed,
                                version: valeCheck.version,
                                platform: process.platform,
                                installation_instructions: valeCheck.installed
                                    ? null
                                    : getInstallationInstructions(),
                                message: valeCheck.installed
                                    ? `Vale is installed and ready to use (${valeCheck.version})`
                                    : "Vale is not installed. Please install it to use Vale linting tools.",
                            }, null, 2),
                        },
                    ],
                };
            }
            case "vale_sync": {
                const { config_path } = args;
                debug(`vale_sync called - config_path: ${config_path}`);
                // Check if Vale is available
                const valeCheck = await checkValeInstalled();
                if (!valeCheck.installed) {
                    return createValeNotInstalledResponse();
                }
                // Determine which config to use
                const effectiveConfigPath = config_path || valeConfigPath;
                // Run vale sync
                const syncResult = await syncValeStyles(effectiveConfigPath);
                debug(`vale_sync result - success: ${syncResult.success}`);
                if (syncResult.success) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `✅ **Vale sync successful**

${syncResult.message}

${syncResult.output ? `**Output:**\n\`\`\`\n${syncResult.output}\n\`\`\`` : ""}

The styles have been downloaded and are ready to use. You can now run \`check_file\` again.`,
                            },
                        ],
                    };
                }
                else {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `❌ **Vale sync failed**

${syncResult.message}

${syncResult.error ? `**Error:**\n\`\`\`\n${syncResult.error}\n\`\`\`` : ""}

Please check your .vale.ini configuration and ensure:
1. The StylesPath is correct
2. Packages are properly defined
3. You have internet connectivity to download packages

See Vale documentation: https://vale.sh/docs/topics/packages/`,
                            },
                        ],
                    };
                }
            }
            case "check_file": {
                const { path: filePath } = args;
                debug(`check_file called - path: ${filePath}`);
                if (!filePath) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    error: "Missing required parameter: path",
                                }),
                            },
                        ],
                    };
                }
                // Check if Vale is available
                const valeCheck = await checkValeInstalled();
                if (!valeCheck.installed) {
                    return createValeNotInstalledResponse();
                }
                const result = await checkFile(filePath, valeConfigPath);
                debug(`check_file result - file: ${result.file}, issues found: ${result.issues.length}, errors: ${result.summary.errors}, warnings: ${result.summary.warnings}, suggestions: ${result.summary.suggestions}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.formatted,
                        },
                    ],
                    _meta: {
                        structured_data: {
                            file: result.file,
                            issues: result.issues,
                            summary: result.summary,
                        },
                    },
                };
            }
            case "check_text": {
                const { text } = args;
                debug(`check_text called - text length: ${text?.length}`);
                if (!text) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    error: "Missing required parameter: text",
                                }),
                            },
                        ],
                    };
                }
                // Check if Vale is available
                const valeCheck = await checkValeInstalled();
                if (!valeCheck.installed) {
                    return createValeNotInstalledResponse();
                }
                const result = await checkText(text, valeConfigPath);
                debug(`check_text result - issues found: ${result.issues.length}, errors: ${result.summary.errors}, warnings: ${result.summary.warnings}, suggestions: ${result.summary.suggestions}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.formatted,
                        },
                    ],
                    _meta: {
                        structured_data: {
                            file: result.file,
                            issues: result.issues,
                            summary: result.summary,
                        },
                    },
                };
            }
            default:
                debug(`Unknown tool called: ${name}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: `Unknown tool: ${name}`,
                            }),
                        },
                    ],
                };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorDetails = error instanceof Error ? error.stack : "No details available";
        // Check if this is an E100 error about missing styles
        if (isStylesDirectoryError(errorMessage)) {
            return {
                content: [
                    {
                        type: "text",
                        text: `❌ **Vale configuration error**

${errorMessage}

This error indicates that Vale's styles directory is missing or the configured packages haven't been downloaded yet.

**Solution:**
Run the \`vale_sync\` tool to download the required style packages:

\`\`\`
vale_sync
\`\`\`

This will:
1. Read your .vale.ini configuration
2. Download all configured style packages
3. Create the necessary styles directory

After running \`vale_sync\`, you can try \`check_file\` again.

For more information, see: https://vale.sh/docs/topics/packages/`,
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        error: errorMessage,
                        details: errorDetails,
                    }),
                },
            ],
        };
    }
});
/**
 * Initialize Vale configuration
 */
async function initializeValeConfig() {
    // Check if Vale is installed
    const valeCheck = await checkValeInstalled();
    if (!valeCheck.installed) {
        console.error("WARNING: Vale is not installed or not in PATH");
        console.error("The server will start, but linting tools will not work until Vale is installed.");
        console.error("");
        console.error("Installation instructions:");
        const instructions = getInstallationInstructions();
        instructions.methods.forEach((method) => {
            console.error(`  ${method.name}: ${method.command}`);
            if (method.url) {
                console.error(`    ${method.url}`);
            }
        });
        console.error("");
        console.error(`Documentation: ${instructions.documentation}`);
        console.error("");
        console.error("Use the 'vale_status' tool to check installation status after installing.");
        console.error("");
        // Don't exit - allow server to start
        return;
    }
    console.error(`Vale version: ${valeCheck.version}`);
    // Priority 1: Check for VALE_CONFIG_PATH environment variable
    if (config.configPath) {
        const resolvedPath = resolveConfigPath(config.configPath);
        if (await verifyConfigFile(resolvedPath)) {
            valeConfigPath = resolvedPath;
            console.error(`Using Vale config from VALE_CONFIG_PATH: ${valeConfigPath}`);
            return;
        }
        else {
            console.error(`WARNING: VALE_CONFIG_PATH points to non-existent file: ${config.configPath}`);
        }
    }
    // Priority 2: Check for .vale.ini in the current working directory
    const workingDirConfig = await findValeIniInWorkingDir();
    if (workingDirConfig) {
        // Use .vale.ini from working directory
        valeConfigPath = workingDirConfig;
        console.error(`Using .vale.ini from working directory: ${valeConfigPath}`);
    }
    else {
        // No .vale.ini found - warn but continue
        console.error("WARNING: No .vale.ini file found in the current working directory");
        console.error(`Current working directory: ${process.cwd()}`);
        console.error("");
        console.error("Vale will use default settings or search parent directories.");
        console.error("For best results, create a .vale.ini file in your project directory.");
        console.error("");
        console.error("Example .vale.ini:");
        console.error("  StylesPath = styles");
        console.error("  Packages = write-good, proselint");
        console.error("");
        console.error("  [*]");
        console.error("  BasedOnStyles = write-good, proselint");
        console.error("");
    }
}
/**
 * Main entry point
 */
async function main() {
    try {
        // Show version and startup info
        const title = `Vale MCP Server v${VERSION}`;
        const boxWidth = Math.max(title.length + 4, 43); // At least 43 chars wide
        const padding = ' '.repeat(Math.floor((boxWidth - title.length - 2) / 2));
        const titleLine = `║${padding}${title}${padding}${title.length % 2 === 0 ? ' ' : ''}║`;
        const border = '═'.repeat(boxWidth - 2);
        console.error(`\n╔${border}╗`);
        console.error(titleLine);
        console.error(`╚${border}╝\n`);
        if (DEBUG) {
            console.error("🐛 Debug mode enabled\n");
        }
        // Initialize Vale configuration
        await initializeValeConfig();
        // Start the server
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error(`✓ Vale MCP Server v${VERSION} running on stdio`);
        if (DEBUG) {
            console.error("✓ Debug logging active - tool calls will be logged");
        }
        console.error("");
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map