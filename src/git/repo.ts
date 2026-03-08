import * as fs from "node:fs/promises";
import * as path from "node:path";
import { simpleGit } from "simple-git";

/**
 * Initializes a new git repository at the specified path.
 *
 * @param repoPath - Absolute path to the directory where the repo will be initialized
 * @throws Error if the directory does not exist
 */
export async function initRepo(repoPath: string): Promise<void> {
	// Verify directory exists
	try {
		await fs.access(repoPath);
	} catch {
		throw new Error(`Directory does not exist: ${repoPath}`);
	}

	await simpleGit(repoPath).init();
}

/**
 * Checks whether a directory is a git repository.
 *
 * @param dirPath - Absolute path to the directory to check
 * @returns true if the directory is a git repo, false otherwise
 */
export async function isGitRepo(dirPath: string): Promise<boolean> {
	try {
		return await simpleGit(dirPath).checkIsRepo();
	} catch {
		return false;
	}
}

/**
 * Stages specified files in the git repository.
 * Always uses explicit file paths -- never `git add .`.
 *
 * @param repoPath - Absolute path to the git repository
 * @param files - Array of relative file paths to stage
 */
export async function addFiles(
	repoPath: string,
	files: string[],
): Promise<void> {
	await simpleGit(repoPath).add(files);
}

/**
 * Creates a commit with the specified message.
 *
 * @param repoPath - Absolute path to the git repository
 * @param message - Commit message
 */
export async function commitFiles(
	repoPath: string,
	message: string,
): Promise<void> {
	await simpleGit(repoPath).commit(message);
}

/**
 * Writes a .gitattributes file enforcing LF line endings.
 *
 * @param repoPath - Absolute path to the directory where .gitattributes will be created
 */
export async function writeGitattributes(repoPath: string): Promise<void> {
	const content = [
		"* text=auto eol=lf",
		"*.json text eol=lf",
		"*.md text eol=lf",
		"*.js text eol=lf",
		"*.sh text eol=lf",
		"",
	].join("\n");

	await fs.writeFile(path.join(repoPath, ".gitattributes"), content);
}
