import { CheckFileResult, CheckOptions, RuleInfo, ExplainRuleResult } from "./types.js";
export declare const MAX_TEXT_BYTES: number;
/**
 * Checks if Vale is installed and accessible (with caching)
 */
export declare function checkValeInstalled(): Promise<{
    installed: boolean;
    version?: string;
    error?: string;
}>;
/**
 * Clear the Vale installation cache (useful for testing or if Vale is installed after server start)
 */
export declare function clearValeInstallCache(): void;
/**
 * Runs vale sync to download styles and packages
 */
export declare function syncValeStyles(configPath?: string): Promise<{
    success: boolean;
    message: string;
    output?: string;
    error?: string;
}>;
/**
 * Vale 3+ is required; versionOutput is e.g. "vale version 3.27.0".
 * Unparseable output is given the benefit of the doubt.
 */
export declare function isSupportedValeVersion(versionOutput?: string): boolean;
/**
 * Runs Vale on a file at a specific path
 */
export declare function checkFile(filePath: string, configPath?: string, options?: CheckOptions): Promise<CheckFileResult>;
/**
 * Runs Vale on every supported file in a directory (recursively)
 */
export declare function checkDirectory(dirPath: string, configPath?: string, options?: CheckOptions): Promise<CheckFileResult>;
/**
 * Runs Vale on text passed directly (via stdin)
 */
export declare function checkText(text: string, textFileExt?: string, configPath?: string, options?: CheckOptions): Promise<CheckFileResult>;
/**
 * Lists the rules of the styles the active config uses (optionally one style).
 * Vale's built-in "Vale" style has no files on disk, so it is not listed.
 */
export declare function listRules(configPath?: string, style?: string): Promise<RuleInfo[]>;
/**
 * Returns one rule's YAML definition and where it is active.
 * `rule` is "Style.Rule" as shown in lint results (the `check` field).
 */
export declare function explainRule(rule: string, configPath?: string): Promise<ExplainRuleResult>;
//# sourceMappingURL=vale-runner.d.ts.map