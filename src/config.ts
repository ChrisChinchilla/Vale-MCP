import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { ValeServerConfig } from "./types.js";

/**
 * Loads configuration from environment variables
 */
export function loadConfig(): ValeServerConfig {
  const config: ValeServerConfig = {};

  // Load config path if specified
  if (process.env.VALE_CONFIG_PATH) {
    config.configPath = process.env.VALE_CONFIG_PATH;
  }

  return config;
}

/**
 * Checks if a .vale.ini file exists in the current working directory (async)
 */
export async function findValeIniInWorkingDir(): Promise<string | null> {
  const cwd = process.cwd();
  const valeIniPath = path.join(cwd, ".vale.ini");

  try {
    await fs.access(valeIniPath, fsSync.constants.R_OK);
    return valeIniPath;
  } catch {
    return null;
  }
}

/**
 * Verifies that a Vale config file exists and is readable (async)
 */
export async function verifyConfigFile(configPath: string): Promise<boolean> {
  try {
    await fs.access(configPath, fsSync.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the absolute path for a config file
 */
export function resolveConfigPath(configPath: string): string {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  return path.resolve(process.cwd(), configPath);
}

