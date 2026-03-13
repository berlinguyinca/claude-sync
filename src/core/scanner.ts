import * as fs from "node:fs/promises";
import * as path from "node:path";
import { normalizePath } from "../platform/paths.js";
import { isPathAllowed } from "./manifest.js";

/**
 * Scans a source directory and returns all files that match the allowlist.
 *
 * @param sourceDir - Absolute path to the directory to scan
 * @param allowlistFn - Optional custom allowlist function. Defaults to isPathAllowed().
 * @returns Sorted array of relative paths (relative to sourceDir) for allowed files
 * @throws Error if sourceDir does not exist
 */
export async function scanDirectory(
	sourceDir: string,
	allowlistFn?: (relativePath: string) => boolean,
): Promise<string[]> {
	const checkAllowed = allowlistFn ?? isPathAllowed;

	// Verify source directory exists
	try {
		await fs.access(sourceDir);
	} catch {
		throw new Error(`Source directory does not exist: ${sourceDir}`);
	}

	// Recursively read directory (Node 22 feature)
	const entries = await fs.readdir(sourceDir, { recursive: true, withFileTypes: true });

	const allowedFiles: string[] = [];

	for (const entry of entries) {
		// Only include regular files — skip directories and symlinks.
		// Excluding symlinks prevents cycles (e.g., a symlink back to a parent)
		// from causing the scanner to loop or include duplicated content.
		if (!entry.isFile() || entry.isSymbolicLink()) {
			continue;
		}

		// Build relative path from the entry
		// entry.parentPath is absolute, so we compute relative from sourceDir
		const relativePath = normalizePath(
			path.relative(sourceDir, path.join(entry.parentPath, entry.name)),
		);

		// Skip files inside .git directories (cloned plugin repos, etc.)
		if (relativePath.includes(".git/") || relativePath.startsWith(".git")) {
			continue;
		}

		if (checkAllowed(relativePath)) {
			allowedFiles.push(relativePath);
		}
	}

	return allowedFiles.sort();
}
