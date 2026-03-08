import * as path from "node:path";

/**
 * Rewrites absolute home directory paths in content to portable {{HOME}} tokens.
 * Used when copying settings.json into the sync repo.
 *
 * Handles Windows-style backslash paths: replaces both the native homeDir and
 * its forward-slash variant, then normalizes any remaining backslash separators
 * after the {{HOME}} token to forward slashes for portable POSIX-style storage.
 *
 * @param content - The file content to process
 * @param homeDir - The absolute path to the home directory to replace
 * @returns Content with home directory paths replaced by {{HOME}} using POSIX separators
 */
export function rewritePathsForRepo(content: string, homeDir: string): string {
	let result = content.replaceAll(homeDir, "{{HOME}}");
	if (path.sep === "\\" || homeDir.includes("\\")) {
		// On Windows, homeDir uses backslashes (e.g. C:\Users\bob).
		// JSON content may contain the JSON-escaped variant with doubled backslashes
		// (e.g. C:\\Users\\bob). Replace that variant too.
		const jsonEscapedHome = homeDir.replaceAll("\\", "\\\\");
		result = result.replaceAll(jsonEscapedHome, "{{HOME}}");
		// Also handle forward-slash variant in case content has mixed separators.
		const forwardSlashHome = homeDir.replaceAll("\\", "/");
		result = result.replaceAll(forwardSlashHome, "{{HOME}}");
	}
	// Normalize backslash path separators in {{HOME}}-prefixed paths to forward slashes.
	// Handles both single backslashes and JSON-escaped double backslashes after the token.
	result = result.replace(
		/\{\{HOME\}\}([^"'\s,}]*)/g,
		(_match, pathPart: string) =>
			`{{HOME}}${pathPart.replaceAll("\\\\", "/").replaceAll("\\", "/")}`,
	);
	return result;
}

/**
 * Expands {{HOME}} tokens in content to the local home directory path.
 * Used when applying settings.json from the sync repo to the local machine.
 *
 * @param content - The file content to process
 * @param homeDir - The absolute path to the local home directory
 * @returns Content with {{HOME}} tokens replaced by the home directory
 */
export function expandPathsForLocal(content: string, homeDir: string): string {
	return content.replaceAll("{{HOME}}", homeDir);
}
