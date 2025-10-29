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
//# sourceMappingURL=config.d.ts.map