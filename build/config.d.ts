import { ValeServerConfig } from "./types.js";
/**
 * Loads configuration from environment variables
 */
export declare function loadConfig(): ValeServerConfig;
/**
 * Checks if a .vale.ini file exists in the current working directory (async)
 */
export declare function findValeIniInWorkingDir(): Promise<string | null>;
/**
 * Verifies that a Vale config file exists and is readable (async)
 */
export declare function verifyConfigFile(configPath: string): Promise<boolean>;
/**
 * Gets the absolute path for a config file
 */
export declare function resolveConfigPath(configPath: string): string;
export declare class PathNotAllowedError extends Error {
}
/**
 * When VALE_ALLOWED_ROOTS is set (path-delimiter separated), rejects paths
 * outside those directories. Symlinks are resolved first so they can't be
 * used to escape. Unset means no restriction.
 */
export declare function assertPathAllowed(target: string): Promise<void>;
//# sourceMappingURL=config.d.ts.map