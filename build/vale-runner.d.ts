import { CheckFileResult } from "./types.js";
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
 * Runs Vale on a file at a specific path
 */
export declare function checkFile(filePath: string, configPath?: string): Promise<CheckFileResult>;
/**
 * Runs Vale on text passed directly (via stdin)
 */
export declare function checkText(text: string, configPath?: string): Promise<CheckFileResult>;
//# sourceMappingURL=vale-runner.d.ts.map