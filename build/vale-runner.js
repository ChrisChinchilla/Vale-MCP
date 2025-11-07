import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
const execAsync = promisify(exec);
// Cache for Vale installation check
let valeInstallCache = {
    checked: false,
    installed: false,
};
/**
 * Checks if Vale is installed and accessible (with caching)
 */
export async function checkValeInstalled() {
    // Return cached result if already checked
    if (valeInstallCache.checked) {
        return {
            installed: valeInstallCache.installed,
            version: valeInstallCache.version,
            error: valeInstallCache.error,
        };
    }
    // Perform the check
    try {
        const { stdout } = await execAsync("vale --version");
        valeInstallCache = {
            checked: true,
            installed: true,
            version: stdout.trim(),
        };
    }
    catch (error) {
        valeInstallCache = {
            checked: true,
            installed: false,
            error: error instanceof Error
                ? error.message
                : "Vale not found in PATH. To install Vale, go to https://vale.sh/docs/vale-cli/installation/",
        };
    }
    return {
        installed: valeInstallCache.installed,
        version: valeInstallCache.version,
        error: valeInstallCache.error,
    };
}
/**
 * Clear the Vale installation cache (useful for testing or if Vale is installed after server start)
 */
export function clearValeInstallCache() {
    valeInstallCache = {
        checked: false,
        installed: false,
    };
}
/**
 * Runs vale sync to download styles and packages
 */
export async function syncValeStyles(configPath) {
    try {
        // Build command
        let command = "vale sync";
        let workingDir = process.cwd();
        // If config path provided, use its directory as working dir
        if (configPath) {
            try {
                await fs.access(configPath, fsSync.constants.R_OK);
                workingDir = path.dirname(path.resolve(configPath));
                command += ` --config="${configPath}"`;
            }
            catch {
                // Config path doesn't exist or isn't readable, use default
                console.error(`Warning: Config path ${configPath} is not accessible`);
            }
        }
        console.error(`Running: ${command}`);
        console.error(`Working directory: ${workingDir}`);
        const { stdout, stderr } = await execAsync(command, {
            cwd: workingDir,
        });
        const output = stdout + (stderr ? `\n${stderr}` : "");
        return {
            success: true,
            message: "Vale styles synchronized successfully",
            output: output.trim(),
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        return {
            success: false,
            message: "Failed to sync Vale styles",
            error: errorMsg,
        };
    }
}
/**
 * Strips markdown code fence formatting from Vale's JSON output
 */
function stripCodeFence(output) {
    // Remove ```json and ``` if present
    return output.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
}
/**
 * Parses Vale's JSON output and handles errors
 */
function parseValeOutput(output) {
    try {
        const cleanedOutput = stripCodeFence(output);
        if (!cleanedOutput) {
            return {};
        }
        return JSON.parse(cleanedOutput);
    }
    catch (error) {
        throw new Error(`Failed to parse Vale JSON output: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
/**
 * Normalizes Vale issues to a more user-friendly format
 */
function normalizeIssues(issues) {
    const normalized = [];
    for (const filePath in issues) {
        const fileIssues = issues[filePath];
        for (const issue of fileIssues) {
            normalized.push({
                line: issue.Line,
                span: issue.Span,
                check: issue.Check,
                message: issue.Message,
                severity: issue.Severity,
                link: issue.Link,
                match: issue.Match,
            });
        }
    }
    return normalized;
}
/**
 * Summary statistics for Vale results
 */
function generateSummary(issues) {
    const summary = {
        total: issues.length,
        errors: 0,
        warnings: 0,
        suggestions: 0,
    };
    for (const issue of issues) {
        switch (issue.severity) {
            case "error":
                summary.errors++;
                break;
            case "warning":
                summary.warnings++;
                break;
            case "suggestion":
                summary.suggestions++;
                break;
        }
    }
    return summary;
}
/**
 * Formats Vale results as human-readable markdown with structured data
 */
function formatValeResults(issues, summary, context) {
    if (issues.length === 0) {
        return `✅ **No style issues found!**\n\nThe text looks good according to Vale style rules.`;
    }
    const severityEmoji = {
        error: "🔴",
        warning: "🟡",
        suggestion: "💡"
    };
    let output = `## Vale linting results\n\n`;
    if (context) {
        output += `**Context:** ${context}\n\n`;
    }
    output += `**Summary:** ${summary.total} issue${summary.total !== 1 ? 's' : ''} found`;
    const parts = [];
    if (summary.errors > 0)
        parts.push(`${summary.errors} error${summary.errors !== 1 ? 's' : ''}`);
    if (summary.warnings > 0)
        parts.push(`${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}`);
    if (summary.suggestions > 0)
        parts.push(`${summary.suggestions} suggestion${summary.suggestions !== 1 ? 's' : ''}`);
    if (parts.length > 0) {
        output += ` (${parts.join(', ')})`;
    }
    output += '\n\n';
    output += `### Issues\n\n`;
    // Group by severity
    const grouped = {
        error: issues.filter(i => i.severity === 'error'),
        warning: issues.filter(i => i.severity === 'warning'),
        suggestion: issues.filter(i => i.severity === 'suggestion')
    };
    for (const [severity, severityIssues] of Object.entries(grouped)) {
        if (severityIssues.length === 0)
            continue;
        for (const issue of severityIssues) {
            const emoji = severityEmoji[severity];
            output += `${emoji} **Line ${issue.line}** (${severity.toUpperCase()}): ${issue.message}\n`;
            if (issue.match) {
                output += `   ↳ Found: "${issue.match}"\n`;
            }
            output += `   ↳ Rule: \`${issue.check}\`\n`;
            if (issue.link) {
                output += `   ↳ [More info](${issue.link})\n`;
            }
            output += '\n';
        }
    }
    return output;
}
/**
 * Runs Vale on a file at a specific path
 */
export async function checkFile(filePath, configPath) {
    // Verify file exists and is readable
    try {
        await fs.access(filePath, fsSync.constants.R_OK);
    }
    catch {
        throw new Error(`File not found or not readable: ${filePath}`);
    }
    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);
    // Build Vale command
    let command = `vale --output=JSON`;
    // Only use --config if explicitly provided (e.g., from VALE_CONFIG_PATH env var)
    // Otherwise let Vale do its natural upward search from the file's location
    if (configPath) {
        command += ` --config="${configPath}"`;
        console.error(`Using explicit config: ${configPath}`);
    }
    else {
        console.error(`Letting Vale search for config from: ${path.dirname(absolutePath)}`);
    }
    command += ` "${absolutePath}"`;
    // Run Vale from the file's directory so it searches upward from there
    const execOptions = {
        encoding: 'utf-8',
        cwd: path.dirname(absolutePath)
    };
    // Execute Vale
    let stdout = "";
    try {
        const result = await execAsync(command, execOptions);
        stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout.toString('utf-8');
    }
    catch (error) {
        // Vale returns non-zero exit code when there are issues
        // But it still outputs JSON to stdout
        if (error.stdout) {
            stdout = error.stdout;
        }
        else {
            const errorMessage = error.stderr || error.message || "Unknown error";
            throw new Error(`Vale execution failed: ${errorMessage}`);
        }
    }
    // Parse output
    const rawOutput = parseValeOutput(stdout);
    const issues = normalizeIssues(rawOutput);
    const summary = generateSummary(issues);
    const formatted = formatValeResults(issues, summary, absolutePath);
    return {
        formatted,
        file: absolutePath,
        issues,
        summary,
    };
}
/**
 * Runs Vale on text passed directly (via stdin)
 */
export async function checkText(text, configPath) {
    // Build Vale command - just pass text via stdin
    let command = `vale --output=JSON`;
    if (configPath) {
        command += ` --config="${configPath}"`;
        console.error(`Using explicit config: ${configPath}`);
    }
    else {
        console.error(`Using Vale defaults or searching for config from current directory`);
    }
    // Execute Vale with text as stdin
    const execOptions = {
        encoding: 'utf-8',
        cwd: process.cwd()
    };
    let stdout = "";
    try {
        const { exec } = await import("child_process");
        const result = await new Promise((resolve, reject) => {
            const child = exec(command, execOptions, (error, stdout, stderr) => {
                if (error && !stdout) {
                    // Only reject if there's no output (means Vale failed to run)
                    reject(error);
                }
                else {
                    // Vale returns non-zero exit code when there are issues, but still outputs JSON
                    const stdoutStr = typeof stdout === 'string' ? stdout : stdout?.toString('utf-8') || '';
                    const stderrStr = typeof stderr === 'string' ? stderr : stderr?.toString('utf-8') || '';
                    resolve({ stdout: stdoutStr, stderr: stderrStr });
                }
            });
            // Write text to stdin and close
            child.stdin?.write(text);
            child.stdin?.end();
        });
        stdout = result.stdout;
    }
    catch (error) {
        const errorMessage = error.stderr || error.message || "Unknown error";
        throw new Error(`Vale execution failed: ${errorMessage}`);
    }
    // Parse output
    const rawOutput = parseValeOutput(stdout);
    const issues = normalizeIssues(rawOutput);
    const summary = generateSummary(issues);
    const formatted = formatValeResults(issues, summary, `text input`);
    return {
        formatted,
        file: `stdin`,
        issues,
        summary,
    };
}
//# sourceMappingURL=vale-runner.js.map