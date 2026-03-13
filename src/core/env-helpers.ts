import * as path from "node:path";
import type { Environment } from "./environment.js";
import { isPathAllowed } from "./manifest.js";

/**
 * Creates an allowlist function for an environment's sync targets.
 */
export function makeAllowlistFn(env: Environment): (relativePath: string) => boolean {
	return (relativePath: string) =>
		isPathAllowed(
			relativePath,
			env.getSyncTargets(),
			env.getPluginSyncPatterns(),
			env.getIgnorePatterns(),
		);
}

/**
 * Checks whether a file needs {{HOME}} path rewriting for the given environment.
 */
export function needsPathRewrite(relativePath: string, env: Environment): boolean {
	const targets = env.getPathRewriteTargets();
	return targets.some((t) => path.basename(relativePath) === t);
}
