import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { assertPathAllowed, PathNotAllowedError } from "./config.js";
// Limits so a huge input or a hung Vale process can't wedge the server
const VALE_TIMEOUT_MS = 60_000;
const VALE_SYNC_TIMEOUT_MS = 300_000; // sync downloads packages
const VALE_MAX_BUFFER = 10 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;
/**
 * Vale writes config/runtime errors to stderr as a JSON object; turn it into
 * "Code: Text". Anything else is returned unchanged.
 */
function describeStderr(stderr) {
    try {
        parseValeOutput(stderr);
    }
    catch (error) {
        if (error instanceof ValeReportedError)
            return error.message;
    }
    return stderr;
}
/**
 * Runs Vale without a shell (arguments are never interpreted by a shell, so
 * user-supplied paths can't inject commands). Vale exits non-zero when it
 * finds issues but still prints JSON, so output is returned whenever there
 * is any, unless the process was killed (timeout / buffer overflow).
 */
function runVale(args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = execFile("vale", args, {
            cwd: options.cwd,
            encoding: "utf-8",
            timeout: options.timeout ?? VALE_TIMEOUT_MS,
            maxBuffer: VALE_MAX_BUFFER,
        }, (error, stdout, stderr) => {
            if (error && (error.killed || (options.requireStdout !== false && !stdout))) {
                const detail = error.killed
                    ? "Vale timed out or produced too much output"
                    : describeStderr(stderr) || error.message;
                reject(new Error(`Vale execution failed: ${detail}`));
            }
            else if (error && options.requireStdout === false) {
                reject(new Error(stderr || error.message));
            }
            else {
                resolve({ stdout, stderr });
            }
        });
        if (options.input !== undefined) {
            child.stdin?.end(options.input);
        }
    });
}
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
        const { stdout } = await runVale(["--version"]);
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
        const args = ["sync"];
        let workingDir = process.cwd();
        // If config path provided, use its directory as working dir
        if (configPath) {
            try {
                await assertPathAllowed(configPath);
                await fs.access(configPath, fsSync.constants.R_OK);
                workingDir = path.dirname(path.resolve(configPath));
                args.push(`--config=${configPath}`);
            }
            catch (error) {
                if (error instanceof PathNotAllowedError)
                    throw error;
                // Config path doesn't exist or isn't readable, use default
                console.error(`Warning: Config path ${configPath} is not accessible`);
            }
        }
        console.error(`Running: vale ${args.join(" ")}`);
        console.error(`Working directory: ${workingDir}`);
        const { stdout, stderr } = await runVale(args, {
            cwd: workingDir,
            timeout: VALE_SYNC_TIMEOUT_MS,
            requireStdout: false,
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
class ValeReportedError extends Error {
}
/**
 * Vale 3+ is required; versionOutput is e.g. "vale version 3.27.0".
 * Unparseable output is given the benefit of the doubt.
 */
export function isSupportedValeVersion(versionOutput) {
    const major = versionOutput?.match(/(\d+)\.\d+/)?.[1];
    return major === undefined || Number(major) >= 3;
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
        const parsed = JSON.parse(cleanedOutput);
        // Vale reports runtime/config problems as a single JSON error object on
        // stdout (exit 2) rather than the usual {file: [issues]} map
        if (typeof parsed?.Code === "string" && typeof parsed?.Text === "string") {
            throw new ValeReportedError(`${parsed.Code}: ${parsed.Text}`);
        }
        return parsed;
    }
    catch (error) {
        if (error instanceof ValeReportedError)
            throw error;
        throw new Error(`Failed to parse Vale JSON output: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
/**
 * Normalizes Vale issues to a more user-friendly format
 */
function normalizeIssues(issues, includeFile = false) {
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
                // Vale emits an empty Action object for rules without a fix
                action: issue.Action?.Name
                    ? { name: issue.Action.Name, params: issue.Action.Params ?? [] }
                    : undefined,
                file: includeFile ? filePath : undefined,
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
function formatValeResults(issues, summary, context, truncated = false) {
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
            const where = issue.file ? `${issue.file}:${issue.line}` : `Line ${issue.line}`;
            output += `${emoji} **${where}** (${severity.toUpperCase()}): ${issue.message}\n`;
            if (issue.match) {
                output += `   ↳ Found: "${issue.match}"\n`;
            }
            output += `   ↳ Rule: \`${issue.check}\`\n`;
            if (issue.action) {
                output += `   ↳ Suggested fix: ${issue.action.name}${issue.action.params.length ? ` (${issue.action.params.map((p) => `"${p}"`).join(", ")})` : ""}\n`;
            }
            if (issue.link) {
                output += `   ↳ [More info](${issue.link})\n`;
            }
            output += '\n';
        }
    }
    if (truncated) {
        output += `_Showing the first ${issues.length} of ${summary.total} issues._\n`;
    }
    return output;
}
const SEVERITY_RANK = { suggestion: 0, warning: 1, error: 2 };
/**
 * Normalizes, filters and formats Vale's parsed output into a result
 */
function buildResult(rawOutput, file, context, options = {}, includeFile = false) {
    let issues = normalizeIssues(rawOutput, includeFile);
    if (options.minSeverity) {
        const min = SEVERITY_RANK[options.minSeverity];
        issues = issues.filter((i) => SEVERITY_RANK[i.severity] >= min);
    }
    const summary = generateSummary(issues);
    const truncated = options.maxIssues !== undefined && issues.length > options.maxIssues;
    if (truncated)
        issues = issues.slice(0, options.maxIssues);
    return {
        formatted: formatValeResults(issues, summary, context, truncated),
        file,
        issues,
        summary,
        truncated,
    };
}
/**
 * Runs Vale on a file at a specific path
 */
export async function checkFile(filePath, configPath, options = {}) {
    // Resolve to absolute path (also stops a leading "-" being read as a flag)
    const absolutePath = path.resolve(process.cwd(), filePath);
    await assertPathAllowed(absolutePath);
    if (configPath)
        await assertPathAllowed(configPath);
    // Verify file exists and is readable
    try {
        await fs.access(absolutePath, fsSync.constants.R_OK);
    }
    catch {
        throw new Error(`File not found or not readable: ${filePath}`);
    }
    const args = ["--output=JSON"];
    // Only use --config if explicitly provided (e.g., from VALE_CONFIG_PATH env var)
    // Otherwise let Vale do its natural upward search from the file's location
    if (configPath) {
        args.push(`--config=${configPath}`);
        console.error(`Using explicit config: ${configPath}`);
    }
    else {
        console.error(`Letting Vale search for config from: ${path.dirname(absolutePath)}`);
    }
    args.push(absolutePath);
    // Run Vale from the file's directory so it searches upward from there
    const { stdout } = await runVale(args, { cwd: path.dirname(absolutePath) });
    // Parse output
    return buildResult(parseValeOutput(stdout), absolutePath, absolutePath, options);
}
/**
 * Runs Vale on every supported file in a directory (recursively)
 */
export async function checkDirectory(dirPath, configPath, options = {}) {
    const absolutePath = path.resolve(process.cwd(), dirPath);
    await assertPathAllowed(absolutePath);
    if (configPath)
        await assertPathAllowed(configPath);
    try {
        if (!(await fs.stat(absolutePath)).isDirectory())
            throw new Error();
    }
    catch {
        throw new Error(`Directory not found: ${dirPath}`);
    }
    const args = ["--output=JSON"];
    if (configPath)
        args.push(`--config=${configPath}`);
    args.push(absolutePath);
    const { stdout } = await runVale(args, { cwd: absolutePath });
    return buildResult(parseValeOutput(stdout), absolutePath, absolutePath, options, true);
}
/**
 * Runs Vale on text passed directly (via stdin)
 */
export async function checkText(text, textFileExt, configPath, options = {}) {
    // Check to see of any text was sent
    if (!text || text.trim() === "") {
        throw new Error(`No text found to check. Make sure the text has content that is not only whitespace.`);
    }
    if (Buffer.byteLength(text, "utf-8") > MAX_TEXT_BYTES) {
        throw new Error(`Text is too large to check (limit is ${MAX_TEXT_BYTES} bytes).`);
    }
    const args = [];
    if (textFileExt) {
        // Clean the provided file extension and
        //  confirm it's in a valid format,
        //  such as: "md", ".md", "txt", ".txt", or "docx"
        const trimmedExt = textFileExt.trim();
        const extPattern = /^\.?[a-zA-Z0-9]+$/;
        if (extPattern.test(trimmedExt)) {
            // If a file extension is provided, we can use Vale's --ext flag to help it apply the correct rules
            const normalizedExt = trimmedExt.startsWith(".") ? trimmedExt : `.${trimmedExt}`;
            args.push(`--ext=${normalizedExt}`);
            console.error(`Using file extension for Vale: ${normalizedExt}`);
        }
        else {
            // If the provided extension is not valid, throw an exception
            throw new Error(`Vale doesn't allow a text file extension of: "${textFileExt}". Allowed format is an optional leading dot followed by letters and digits.`);
        }
    }
    if (configPath) {
        await assertPathAllowed(configPath);
        args.push(`--config=${configPath}`);
        console.error(`Using explicit config: ${configPath}`);
    }
    else {
        console.error(`Using Vale defaults or searching for config from current directory`);
    }
    args.push("--output=JSON");
    // Vale has no stdin flag; with no file argument it reads stdin
    const { stdout } = await runVale(args, { cwd: process.cwd(), input: text });
    // Parse output
    return buildResult(parseValeOutput(stdout), `stdin`, `text input`, options);
}
//# sourceMappingURL=vale-runner.js.map