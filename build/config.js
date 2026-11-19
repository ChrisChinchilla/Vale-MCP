import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
/**
 * Loads configuration from environment variables
 */
export function loadConfig() {
    const config = {};
    // Load config path if specified
    if (process.env.VALE_CONFIG_PATH) {
        config.configPath = process.env.VALE_CONFIG_PATH;
    }
    return config;
}
/**
 * Checks if a .vale.ini file exists in the current working directory (async)
 */
export async function findValeIniInWorkingDir() {
    const cwd = process.cwd();
    const valeIniPath = path.join(cwd, ".vale.ini");
    try {
        await fs.access(valeIniPath, fsSync.constants.R_OK);
        return valeIniPath;
    }
    catch {
        return null;
    }
}
/**
 * Verifies that a Vale config file exists and is readable (async)
 */
export async function verifyConfigFile(configPath) {
    try {
        await fs.access(configPath, fsSync.constants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Gets the absolute path for a config file
 */
export function resolveConfigPath(configPath) {
    if (path.isAbsolute(configPath)) {
        return configPath;
    }
    return path.resolve(process.cwd(), configPath);
}
export class PathNotAllowedError extends Error {
}
/**
 * When VALE_ALLOWED_ROOTS is set (path-delimiter separated), rejects paths
 * outside those directories. Symlinks are resolved first so they can't be
 * used to escape. Unset means no restriction.
 */
export async function assertPathAllowed(target) {
    const roots = process.env.VALE_ALLOWED_ROOTS?.split(path.delimiter).filter(Boolean);
    if (!roots?.length)
        return;
    // Resolve the nearest existing ancestor so not-yet-existing paths still get checked
    let real = path.resolve(target);
    const tail = [];
    for (;;) {
        try {
            real = path.join(await fs.realpath(real), ...tail);
            break;
        }
        catch {
            const parent = path.dirname(real);
            if (parent === real)
                break;
            tail.unshift(path.basename(real));
            real = parent;
        }
    }
    for (const root of roots) {
        let realRoot;
        try {
            realRoot = await fs.realpath(path.resolve(root));
        }
        catch {
            continue;
        }
        const rel = path.relative(realRoot, real);
        // ".." alone or "../x" is outside; a folder merely named "..drafts" is inside
        if (rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel)))
            return;
    }
    throw new PathNotAllowedError(`Access denied: ${target} is outside the directories allowed by VALE_ALLOWED_ROOTS`);
}
//# sourceMappingURL=config.js.map