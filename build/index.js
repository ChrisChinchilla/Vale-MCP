#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkValeInstalled, checkFile, checkText, syncValeStyles, checkDirectory, listRules, explainRule, isSupportedValeVersion } from "./vale-runner.js";
import { loadConfig, verifyConfigFile, resolveConfigPath, findValeIniInWorkingDir, assertPathAllowed, } from "./config.js";
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
    console.log(`
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
  VALE_ALLOWED_ROOTS  Directories (path-delimiter separated) that check_file and
                      config paths are restricted to. Unset means no restriction.

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
    console.log(VERSION);
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
        isError: true,
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
 * Check if an error is an E201 missing styles / StylesPath error
 */
function isStylesDirectoryError(errorMessage) {
    // Vale reports a missing StylesPath or an unsynced style as E201, e.g.
    // "Style 'Foo' isn't on the StylesPath" / "The StylesPath '...' doesn't exist".
    // (E100 "path ... does not exist" is a missing config/input, which sync can't fix.)
    return /E201.*StylesPath/i.test(errorMessage);
}
/**
 * Builds the CallToolResult for a caught linting error, with dedicated
 * guidance when it looks like Vale's styles directory hasn't been synced.
 */
function handleValeLintError(error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : "No details available";
    if (isStylesDirectoryError(errorMessage)) {
        return {
            isError: true,
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
        isError: true,
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
// Result-filtering inputs shared by all check tools
const filterInputSchema = {
    min_severity: z
        .enum(["suggestion", "warning", "error"])
        .optional()
        .describe("Only report issues at or above this severity. Defaults to all."),
    max_issues: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Return at most this many issues (summary still counts all of them). Use to keep results small for large files."),
};
function toToolResult(result) {
    return {
        content: [{ type: "text", text: result.formatted }],
        structuredContent: {
            file: result.file,
            issues: result.issues,
            summary: result.summary,
            truncated: result.truncated ?? false,
        },
    };
}
// Initialize the MCP server
const server = new McpServer({
    name: "vale-mcp",
    version: VERSION,
});
server.registerTool("vale_status", {
    description: "Check if Vale (vale.sh) is installed and accessible. Use this first if other Vale tools fail. Returns installation status, version if available, and installation instructions for the current platform.",
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
    },
}, async () => {
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
                        ? `Vale is installed and ready to use (${valeCheck.version})${isSupportedValeVersion(valeCheck.version)
                            ? ""
                            : ". Warning: this server requires Vale 3.0 or newer, so some features may not work"}`
                        : "Vale is not installed. Please install it to use Vale linting tools.",
                }, null, 2),
            },
        ],
    };
});
server.registerTool("vale_sync", {
    description: "Download Vale styles and packages by running 'vale sync'. Use this when you see errors about missing styles directories (E201 errors like \"Style 'X' isn't on the StylesPath\"). This command reads the .vale.ini configuration and downloads the required style packages.",
    inputSchema: {
        config_path: z
            .string()
            .optional()
            .describe("Optional path to .vale.ini file. If not provided, uses the server's configured path or searches in the current directory."),
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
    },
}, async ({ config_path }) => {
    debug(`vale_sync called - config_path: ${config_path}`);
    const valeCheck = await checkValeInstalled();
    if (!valeCheck.installed) {
        return createValeNotInstalledResponse();
    }
    const effectiveConfigPath = config_path || valeConfigPath;
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
    return {
        isError: true,
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
});
server.registerTool("check_file", {
    description: "Lint a file at a specific path against Vale style rules. Returns issues found with their locations and severity. If Vale is not installed, returns error with installation guidance.",
    inputSchema: {
        path: z.string().describe("Absolute or relative path to the file to check"),
        config_path: z
            .string()
            .optional()
            .describe("Optional path to .vale.ini file. If not provided, Vale will search for .vale.ini starting from the file's directory and moving upward through parent directories."),
        ...filterInputSchema,
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
    },
}, async ({ path: filePath, config_path, min_severity, max_issues }) => {
    debug(`check_file called - path: ${filePath}, config_path: ${config_path}`);
    const valeCheck = await checkValeInstalled();
    if (!valeCheck.installed) {
        return createValeNotInstalledResponse();
    }
    try {
        // Only pass config_path if explicitly provided by the user
        // This allows Vale to use its natural upward search from the file's directory
        const result = await checkFile(filePath, config_path, {
            minSeverity: min_severity,
            maxIssues: max_issues,
        });
        debug(`check_file result - file: ${result.file}, issues found: ${result.issues.length}, errors: ${result.summary.errors}, warnings: ${result.summary.warnings}, suggestions: ${result.summary.suggestions}`);
        return toToolResult(result);
    }
    catch (error) {
        return handleValeLintError(error);
    }
});
server.registerTool("check_text", {
    description: "Lint text content directly against Vale style rules without requiring a file. Useful for checking text snippets, clipboard content, or dynamically generated content. Returns issues found with their locations and severity.",
    inputSchema: {
        text: z.string().describe("The text content to check with Vale"),
        text_file_ext: z
            .string()
            .optional()
            .describe("Optional file extension for Vale to apply when checking the text (e.g., '.md', '.txt'). This can help Vale apply file format-specific rules if needed."),
        config_path: z
            .string()
            .optional()
            .describe("Optional path to .vale.ini file. If not provided, uses the server's configured path or searches in the current directory."),
        ...filterInputSchema,
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
    },
}, async ({ text, text_file_ext, config_path, min_severity, max_issues }) => {
    debug(`check_text called - text length: ${text?.length}, text_file_ext: ${text_file_ext}, config_path: ${config_path}`);
    const valeCheck = await checkValeInstalled();
    if (!valeCheck.installed) {
        return createValeNotInstalledResponse();
    }
    try {
        // Use the provided config_path if given, otherwise fall back to the
        // server's configured path since there's no file directory to search from
        const effectiveConfigPath = config_path !== undefined ? config_path : valeConfigPath;
        const result = await checkText(text, text_file_ext, effectiveConfigPath, {
            minSeverity: min_severity,
            maxIssues: max_issues,
        });
        debug(`check_text result - issues found: ${result.issues.length}, errors: ${result.summary.errors}, warnings: ${result.summary.warnings}, suggestions: ${result.summary.suggestions}`);
        return toToolResult(result);
    }
    catch (error) {
        return handleValeLintError(error);
    }
});
server.registerTool("check_directory", {
    description: "Lint every file Vale supports in a directory (recursively) against Vale style rules. Returns issues with their file and line, plus a combined summary. Use min_severity and max_issues to keep results small.",
    inputSchema: {
        path: z.string().describe("Absolute or relative path to the directory to check"),
        config_path: z
            .string()
            .optional()
            .describe("Optional path to .vale.ini file. If not provided, Vale will search for .vale.ini starting from the directory and moving upward."),
        ...filterInputSchema,
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
    },
}, async ({ path: dirPath, config_path, min_severity, max_issues }) => {
    debug(`check_directory called - path: ${dirPath}, config_path: ${config_path}`);
    const valeCheck = await checkValeInstalled();
    if (!valeCheck.installed) {
        return createValeNotInstalledResponse();
    }
    try {
        const result = await checkDirectory(dirPath, config_path, {
            minSeverity: min_severity,
            maxIssues: max_issues,
        });
        debug(`check_directory result - issues found: ${result.summary.total}`);
        return toToolResult(result);
    }
    catch (error) {
        return handleValeLintError(error);
    }
});
server.registerTool("list_rules", {
    description: "List the Vale rules (style checks) available in the active config, with each rule's name (Style.Rule, as shown in lint results), level, check type, message and whether it is enabled. Use it to see what Vale will check, or to find a rule to explain. Vale's built-in 'Vale' style (spelling etc.) has no rule files and is not listed.",
    inputSchema: {
        style: z
            .string()
            .optional()
            .describe("Only list rules from this style (e.g. 'write-good'). Defaults to all styles the config uses."),
        config_path: z
            .string()
            .optional()
            .describe("Optional path to .vale.ini file. If not provided, uses the server's configured path or searches in the current directory."),
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
    },
}, async ({ style, config_path }) => {
    debug(`list_rules called - style: ${style}, config_path: ${config_path}`);
    const valeCheck = await checkValeInstalled();
    if (!valeCheck.installed) {
        return createValeNotInstalledResponse();
    }
    try {
        const rules = await listRules(config_path ?? valeConfigPath, style);
        const lines = rules.map((r) => {
            const enabled = r.sections.some((s) => s.enabled) ? "" : " [disabled]";
            const detail = [r.level, r.extends].filter(Boolean).join(", ");
            return `- **${r.name}**${enabled}${detail ? ` (${detail})` : ""}${r.message ? `: ${r.message}` : ""}`;
        });
        return {
            content: [
                {
                    type: "text",
                    text: rules.length
                        ? `## Vale rules (${rules.length})\n\n${lines.join("\n")}\n\nUse \`explain_rule\` with a rule name for its full definition.`
                        : "No rule files found for the styles in this config. (Vale's built-in `Vale` style has no files; run `vale_sync` if packages are missing.)",
                },
            ],
            structuredContent: { rules },
        };
    }
    catch (error) {
        return handleValeLintError(error);
    }
});
server.registerTool("explain_rule", {
    description: "Show the full definition of one Vale rule and where it is active, given its name as it appears in lint results (the 'check' field, e.g. 'write-good.Passive'). Use it to explain why a rule fired or how to satisfy it.",
    inputSchema: {
        rule: z.string().describe("Rule name in 'Style.Rule' form, e.g. 'write-good.Passive'"),
        config_path: z
            .string()
            .optional()
            .describe("Optional path to .vale.ini file. If not provided, uses the server's configured path or searches in the current directory."),
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
    },
}, async ({ rule, config_path }) => {
    debug(`explain_rule called - rule: ${rule}, config_path: ${config_path}`);
    const valeCheck = await checkValeInstalled();
    if (!valeCheck.installed) {
        return createValeNotInstalledResponse();
    }
    try {
        const result = await explainRule(rule, config_path ?? valeConfigPath);
        const where = result.rule.sections
            .map((s) => `- \`${s.glob}\`: ${s.enabled ? "enabled" : "disabled"}${s.level ? ` (${s.level})` : ""}`)
            .join("\n");
        return {
            content: [
                {
                    type: "text",
                    text: `## ${result.rule.name}\n\n${result.rule.description ? `${result.rule.description}\n\n` : ""}**Active in:**\n${where || "- not used by the active config"}\n\n**Definition** (\`${result.file}\`):\n\`\`\`yaml\n${result.definition.trimEnd()}\n\`\`\`${result.rule.link ? `\n\nMore info: ${result.rule.link}` : ""}`,
                },
            ],
            structuredContent: { rule: result.rule, file: result.file, definition: result.definition },
        };
    }
    catch (error) {
        return handleValeLintError(error);
    }
});
server.registerResource("vale-config", "vale://config", {
    title: "Active Vale configuration",
    description: "The .vale.ini the server is using (from VALE_CONFIG_PATH or the working directory), so you can see which styles and settings apply.",
    mimeType: "text/plain",
}, async (uri) => {
    if (!valeConfigPath) {
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "text/plain",
                    text: "No .vale.ini was found at server start (checked VALE_CONFIG_PATH and the working directory). Vale will use its defaults or search upward from each file.",
                },
            ],
        };
    }
    await assertPathAllowed(valeConfigPath);
    return {
        contents: [
            {
                uri: uri.href,
                mimeType: "text/plain",
                text: `# ${valeConfigPath}\n${await fs.promises.readFile(valeConfigPath, "utf-8")}`,
            },
        ],
    };
});
const userPrompt = (text) => ({
    messages: [{ role: "user", content: { type: "text", text } }],
});
server.registerPrompt("fix_style_issues", {
    title: "Fix style issues in a file",
    description: "Lint a file with Vale, fix the issues, and re-check until it is clean.",
    argsSchema: {
        path: z.string().describe("Path to the file to fix"),
        min_severity: z
            .enum(["suggestion", "warning", "error"])
            .optional()
            .describe("Lowest severity to fix (default: warning)"),
    },
}, ({ path: filePath, min_severity }) => userPrompt(`Fix the prose style issues in ${filePath} using the Vale tools.

1. Run check_file on the file with min_severity "${min_severity ?? "warning"}".
2. Fix each issue in the file. Use an issue's suggested fix (the action field) when it has one; otherwise rewrite the text minimally and keep the meaning and voice. If you are unsure why a rule fired, use explain_rule.
3. Run check_file again and repeat until no issues remain, or only issues you judge to be false positives. List any you left alone and why.
4. Finish with a short summary of what changed.`));
server.registerPrompt("review_text", {
    title: "Review text against the style guide",
    description: "Check a piece of text with Vale and suggest an improved version.",
    argsSchema: {
        text: z.string().describe("The text to review"),
        text_file_ext: z.string().optional().describe("Format of the text, e.g. .md (default: .md)"),
    },
}, ({ text, text_file_ext }) => userPrompt(`Review this text against the project's Vale style rules.

Run check_text with text_file_ext "${text_file_ext ?? ".md"}", summarise the issues by severity, then give a corrected version that resolves them without changing the meaning.

Text:
"""
${text}
"""`));
server.registerPrompt("explain_style_rule", {
    title: "Explain a Vale rule",
    description: "Explain what a Vale rule checks and how to satisfy it.",
    argsSchema: {
        rule: z.string().describe("Rule name as shown in lint results, e.g. write-good.Passive"),
    },
}, ({ rule }) => userPrompt(`Use explain_rule for "${rule}", then explain in plain language what it checks, why the style guide has it, and show a before and after example of text that triggers it and text that passes.`));
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