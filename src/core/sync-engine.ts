import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
	addFiles,
	commitFiles,
	fetchRemote,
	getStatus,
	hasRemote,
	pullFromRemote,
	pushToRemote,
} from "../git/repo.js";
import { createBackup } from "./backup.js";
import { makeAllowlistFn, needsPathRewrite } from "./env-helpers.js";
import type { Environment } from "./environment.js";
import { detectRepoVersion } from "./migration.js";
import { expandPathsForLocal, rewritePathsForRepo } from "./path-rewriter.js";
import { scanDirectory } from "./scanner.js";

/**
 * Options for sync operations.
 */
export interface SyncOptions {
	/** @deprecated Use environments instead. Falls back to single claude env. */
	claudeDir?: string;
	syncRepoDir: string;
	homeDir?: string;
	environments?: Environment[];
}

/**
 * Result of a syncPush operation.
 */
export interface SyncPushResult {
	filesUpdated: number;
	pushed: boolean;
	message: string;
	fileChanges: FileChange[];
	perEnvironment?: Record<string, { filesUpdated: number; fileChanges: FileChange[] }>;
}

/**
 * Result of a syncPull operation.
 */
export interface SyncPullResult {
	backupDir: string;
	filesApplied: number;
	message: string;
	fileChanges: FileChange[];
	perEnvironment?: Record<string, { filesApplied: number; fileChanges: FileChange[] }>;
}

/**
 * Represents a file change detected during sync status comparison.
 */
export interface FileChange {
	path: string;
	type: "modified" | "added" | "deleted";
}

/**
 * Result of a syncStatus operation.
 */
export interface SyncStatusResult {
	localModifications: FileChange[];
	remoteDrift: { ahead: number; behind: number };
	excludedCount: number;
	syncedCount: number;
	branch: string | null;
	tracking: string | null;
	isClean: boolean;
	hasRemote: boolean;
	perEnvironment?: Record<
		string,
		{ localModifications: FileChange[]; syncedCount: number; excludedCount: number }
	>;
}

/**
 * Resolves the effective config dir and home dir for a legacy SyncOptions.
 */
function resolveLegacyPaths(options: SyncOptions): {
	claudeDir: string;
	homeDir: string;
} {
	const claudeDir = options.claudeDir ?? path.join(options.homeDir ?? "", ".claude");
	const homeDir = options.homeDir ?? path.dirname(claudeDir);
	return { claudeDir, homeDir };
}

/**
 * Returns the subdirectory within the sync repo for an environment.
 * v1 repos use the root (empty string), v2 repos use env.id.
 */
function getRepoSubdir(syncRepoDir: string, envId: string, version: 1 | 2): string {
	return version === 1 ? syncRepoDir : path.join(syncRepoDir, envId);
}

/**
 * Pushes local config files to the sync repo and remote.
 */
export async function syncPush(options: SyncOptions): Promise<SyncPushResult> {
	const { syncRepoDir } = options;

	// Check remote exists
	const remoteConfigured = await hasRemote(syncRepoDir);
	if (!remoteConfigured) {
		throw new Error(
			`No remote configured. Add a remote with: git -C ${syncRepoDir} remote add origin <url>`,
		);
	}

	// Fetch and check if behind
	await fetchRemote(syncRepoDir);
	const preStatus = await getStatus(syncRepoDir);
	if (preStatus.behind > 0) {
		throw new Error("Remote has changes. Run 'ai-sync pull' first.");
	}

	const version = await detectRepoVersion(syncRepoDir);
	const perEnvironment: Record<string, { filesUpdated: number; fileChanges: FileChange[] }> = {};

	if (options.environments && options.environments.length > 0 && version === 2) {
		// v2 multi-environment mode
		for (const env of options.environments) {
			const configDir = env.getConfigDir();
			const homeDir = options.homeDir ?? path.dirname(configDir);
			const repoSubdir = getRepoSubdir(syncRepoDir, env.id, 2);

			try {
				await fs.access(configDir);
			} catch {
				// Config dir doesn't exist for this env, skip
				perEnvironment[env.id] = { filesUpdated: 0, fileChanges: [] };
				continue;
			}

			const allowlistFn = makeAllowlistFn(env);
			const localFiles = await scanDirectory(configDir, allowlistFn);

			// Copy each file from configDir to repoSubdir
			await fs.mkdir(repoSubdir, { recursive: true });
			for (const relativePath of localFiles) {
				const srcPath = path.join(configDir, relativePath);
				const destPath = path.join(repoSubdir, relativePath);
				await fs.mkdir(path.dirname(destPath), { recursive: true });
				let content = await fs.readFile(srcPath, "utf-8");
				if (needsPathRewrite(relativePath, env)) {
					content = rewritePathsForRepo(content, homeDir);
				}
				await fs.writeFile(destPath, content);
			}

			// Delete files from repo subdir that no longer exist locally
			try {
				const repoFiles = await scanDirectory(repoSubdir, allowlistFn);
				const localFileSet = new Set(localFiles);
				for (const repoFile of repoFiles) {
					if (!localFileSet.has(repoFile)) {
						await fs.rm(path.join(repoSubdir, repoFile));
					}
				}
			} catch {
				// Subdir might not exist yet
			}

			perEnvironment[env.id] = { filesUpdated: 0, fileChanges: [] };
		}
	} else {
		// v1 flat mode or single-environment fallback
		const { claudeDir, homeDir } = resolveLegacyPaths(options);
		const localFiles = await scanDirectory(claudeDir);

		for (const relativePath of localFiles) {
			const srcPath = path.join(claudeDir, relativePath);
			const destPath = path.join(syncRepoDir, relativePath);
			await fs.mkdir(path.dirname(destPath), { recursive: true });
			let content = await fs.readFile(srcPath, "utf-8");
			if (path.basename(relativePath) === "settings.json") {
				content = rewritePathsForRepo(content, homeDir);
			}
			await fs.writeFile(destPath, content);
		}

		// Delete files from repo that no longer exist locally
		const repoFiles = await scanDirectory(syncRepoDir);
		const localFileSet = new Set(localFiles);
		for (const repoFile of repoFiles) {
			if (!localFileSet.has(repoFile)) {
				await fs.rm(path.join(syncRepoDir, repoFile));
			}
		}
	}

	// Check git status
	const status = await getStatus(syncRepoDir);
	if (status.isClean()) {
		if (status.ahead > 0) {
			await pushToRemote(syncRepoDir);
			return {
				filesUpdated: 0,
				pushed: true,
				message: "Pushed previously committed changes to remote",
				fileChanges: [],
				perEnvironment: Object.keys(perEnvironment).length > 0 ? perEnvironment : undefined,
			};
		}
		return {
			filesUpdated: 0,
			pushed: false,
			message: "No changes to push",
			fileChanges: [],
			perEnvironment: Object.keys(perEnvironment).length > 0 ? perEnvironment : undefined,
		};
	}

	// Build file change list from git status
	const fileChanges: FileChange[] = status.files.map((f) => ({
		path: f.path,
		type:
			f.working_dir === "?"
				? "added"
				: f.working_dir === "D"
					? "deleted"
					: "modified",
	}));

	// Update per-environment stats
	if (options.environments && version === 2) {
		for (const env of options.environments) {
			const prefix = `${env.id}/`;
			const envChanges = fileChanges.filter((c) => c.path.startsWith(prefix));
			perEnvironment[env.id] = {
				filesUpdated: envChanges.length,
				fileChanges: envChanges.map((c) => ({
					...c,
					path: c.path.slice(prefix.length),
				})),
			};
		}
	}

	// Stage, commit, push
	await addFiles(syncRepoDir, ["."]);
	await commitFiles(syncRepoDir, "sync: update config");
	await pushToRemote(syncRepoDir);

	return {
		filesUpdated: fileChanges.length,
		pushed: true,
		message: `Pushed ${fileChanges.length} files to remote`,
		fileChanges,
		perEnvironment: Object.keys(perEnvironment).length > 0 ? perEnvironment : undefined,
	};
}

/**
 * Pulls remote changes into local config directories.
 */
export async function syncPull(options: SyncOptions): Promise<SyncPullResult> {
	const { syncRepoDir } = options;

	// Check remote exists
	const remoteConfigured = await hasRemote(syncRepoDir);
	if (!remoteConfigured) {
		throw new Error(
			`No remote configured. Add a remote with: git -C ${syncRepoDir} remote add origin <url>`,
		);
	}

	const version = await detectRepoVersion(syncRepoDir);
	const allFileChanges: FileChange[] = [];
	let backupDir = "";
	let totalApplied = 0;
	const perEnvironment: Record<string, { filesApplied: number; fileChanges: FileChange[] }> = {};

	if (options.environments && options.environments.length > 0 && version === 2) {
		// v2 multi-environment mode: backup all environments first
		const backupBaseDir = path.join(path.dirname(syncRepoDir), ".ai-sync-backups");
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		backupDir = path.join(backupBaseDir, timestamp);
		await fs.mkdir(backupDir, { recursive: true });

		for (const env of options.environments) {
			const configDir = env.getConfigDir();
			try {
				await fs.access(configDir);
				const envBackupDir = path.join(backupDir, env.id);
				const allowlistFn = makeAllowlistFn(env);
				const existingFiles = await scanDirectory(configDir, allowlistFn);
				if (existingFiles.length > 0) {
					await fs.mkdir(envBackupDir, { recursive: true });
					for (const relativePath of existingFiles) {
						const srcPath = path.join(configDir, relativePath);
						const destPath = path.join(envBackupDir, relativePath);
						await fs.mkdir(path.dirname(destPath), { recursive: true });
						await fs.copyFile(srcPath, destPath);
					}
				}
			} catch {
				// Config dir doesn't exist, nothing to back up
			}
		}

		// Pull from remote
		await pullFromRemote(syncRepoDir);

		// Apply files per environment
		for (const env of options.environments) {
			const configDir = env.getConfigDir();
			const homeDir = options.homeDir ?? path.dirname(configDir);
			const repoSubdir = getRepoSubdir(syncRepoDir, env.id, 2);
			const allowlistFn = makeAllowlistFn(env);
			const envChanges: FileChange[] = [];

			try {
				await fs.access(repoSubdir);
			} catch {
				// No files for this environment in repo
				perEnvironment[env.id] = { filesApplied: 0, fileChanges: [] };
				continue;
			}

			await fs.mkdir(configDir, { recursive: true });
			const repoFiles = await scanDirectory(repoSubdir, allowlistFn);

			for (const relativePath of repoFiles) {
				const srcPath = path.join(repoSubdir, relativePath);
				const destPath = path.join(configDir, relativePath);
				await fs.mkdir(path.dirname(destPath), { recursive: true });
				let content = await fs.readFile(srcPath, "utf-8");
				if (needsPathRewrite(relativePath, env)) {
					content = expandPathsForLocal(content, homeDir);
				}

				let changeType: FileChange["type"] | null = null;
				try {
					const existing = await fs.readFile(destPath, "utf-8");
					if (existing !== content) changeType = "modified";
				} catch {
					changeType = "added";
				}
				await fs.writeFile(destPath, content);
				if (changeType) {
					envChanges.push({ path: relativePath, type: changeType });
					allFileChanges.push({ path: `${env.id}/${relativePath}`, type: changeType });
				}
			}

			// Remove local files that no longer exist in the repo
			try {
				const localFiles = await scanDirectory(configDir, allowlistFn);
				const repoFileSet = new Set(repoFiles);
				for (const localFile of localFiles) {
					if (!repoFileSet.has(localFile)) {
						await fs.rm(path.join(configDir, localFile));
						envChanges.push({ path: localFile, type: "deleted" });
						allFileChanges.push({ path: `${env.id}/${localFile}`, type: "deleted" });
					}
				}
			} catch {
				// Nothing to clean up
			}

			totalApplied += repoFiles.length;
			perEnvironment[env.id] = { filesApplied: repoFiles.length, fileChanges: envChanges };
		}
	} else {
		// v1 flat mode or single-environment fallback
		const { claudeDir, homeDir } = resolveLegacyPaths(options);

		// Create backup
		const backupBaseDir = path.join(path.dirname(syncRepoDir), ".ai-sync-backups");
		// Fallback: check if old backup dir exists
		const oldBackupDir = path.join(path.dirname(syncRepoDir), ".claude-sync-backups");
		let effectiveBackupBase = backupBaseDir;
		try {
			await fs.access(oldBackupDir);
			effectiveBackupBase = oldBackupDir;
		} catch {
			// use new path
		}
		backupDir = await createBackup(claudeDir, effectiveBackupBase);

		// Pull from remote
		await pullFromRemote(syncRepoDir);

		// Scan repo for files to apply
		const repoFiles = await scanDirectory(syncRepoDir);

		for (const relativePath of repoFiles) {
			const srcPath = path.join(syncRepoDir, relativePath);
			const destPath = path.join(claudeDir, relativePath);
			await fs.mkdir(path.dirname(destPath), { recursive: true });
			let content = await fs.readFile(srcPath, "utf-8");
			if (path.basename(relativePath) === "settings.json") {
				content = expandPathsForLocal(content, homeDir);
			}

			let changeType: FileChange["type"] | null = null;
			try {
				const existing = await fs.readFile(destPath, "utf-8");
				if (existing !== content) changeType = "modified";
			} catch {
				changeType = "added";
			}
			await fs.writeFile(destPath, content);
			if (changeType) {
				allFileChanges.push({ path: relativePath, type: changeType });
			}
		}

		// Remove local files that no longer exist in the repo (propagate deletions)
		const localFiles = await scanDirectory(claudeDir);
		const repoFileSet = new Set(repoFiles);
		for (const localFile of localFiles) {
			if (!repoFileSet.has(localFile)) {
				await fs.rm(path.join(claudeDir, localFile));
				allFileChanges.push({ path: localFile, type: "deleted" });
			}
		}

		totalApplied = repoFiles.length;
	}

	return {
		backupDir,
		filesApplied: totalApplied,
		message: `Applied ${totalApplied} files from remote. Backup at: ${backupDir}`,
		fileChanges: allFileChanges,
		perEnvironment: Object.keys(perEnvironment).length > 0 ? perEnvironment : undefined,
	};
}

/**
 * Compares local config, sync repo, and remote for status.
 */
export async function syncStatus(options: SyncOptions): Promise<SyncStatusResult> {
	const { syncRepoDir } = options;

	// Check remote and fetch if available
	const remoteConfigured = await hasRemote(syncRepoDir);
	let gitStatus: {
		ahead: number;
		behind: number;
		current: string | null;
		tracking: string | null;
	};

	if (remoteConfigured) {
		await fetchRemote(syncRepoDir);
		const status = await getStatus(syncRepoDir);
		gitStatus = {
			ahead: status.ahead,
			behind: status.behind,
			current: status.current,
			tracking: status.tracking,
		};
	} else {
		const status = await getStatus(syncRepoDir);
		gitStatus = {
			ahead: 0,
			behind: 0,
			current: status.current,
			tracking: null,
		};
	}

	const version = await detectRepoVersion(syncRepoDir);
	const allModifications: FileChange[] = [];
	let totalSynced = 0;
	let totalExcluded = 0;
	const perEnvironment: Record<
		string,
		{ localModifications: FileChange[]; syncedCount: number; excludedCount: number }
	> = {};

	if (options.environments && options.environments.length > 0 && version === 2) {
		// v2 multi-environment mode
		for (const env of options.environments) {
			const configDir = env.getConfigDir();
			const homeDir = options.homeDir ?? path.dirname(configDir);
			const repoSubdir = getRepoSubdir(syncRepoDir, env.id, 2);
			const allowlistFn = makeAllowlistFn(env);
			const envMods: FileChange[] = [];

			let localFiles: string[] = [];
			let repoFiles: string[] = [];

			try {
				localFiles = await scanDirectory(configDir, allowlistFn);
			} catch {
				// Config dir doesn't exist
			}

			try {
				repoFiles = await scanDirectory(repoSubdir, allowlistFn);
			} catch {
				// Repo subdir doesn't exist
			}

			const localFileSet = new Set(localFiles);
			const repoFileSet = new Set(repoFiles);

			// Compare local vs repo
			for (const relativePath of localFiles) {
				if (!repoFileSet.has(relativePath)) {
					envMods.push({ path: relativePath, type: "added" });
					allModifications.push({ path: `${env.id}/${relativePath}`, type: "added" });
					continue;
				}
				const localContent = await fs.readFile(
					path.join(configDir, relativePath),
					"utf-8",
				);
				const repoContent = await fs.readFile(
					path.join(repoSubdir, relativePath),
					"utf-8",
				);
				let normalizedLocal = localContent;
				if (needsPathRewrite(relativePath, env)) {
					normalizedLocal = rewritePathsForRepo(localContent, homeDir);
				}
				if (normalizedLocal !== repoContent) {
					envMods.push({ path: relativePath, type: "modified" });
					allModifications.push({
						path: `${env.id}/${relativePath}`,
						type: "modified",
					});
				}
			}

			for (const repoFile of repoFiles) {
				if (!localFileSet.has(repoFile)) {
					envMods.push({ path: repoFile, type: "deleted" });
					allModifications.push({ path: `${env.id}/${repoFile}`, type: "deleted" });
				}
			}

			// Count excluded files
			let excludedCount = 0;
			try {
				const allEntries = await fs.readdir(configDir, {
					recursive: true,
					withFileTypes: true,
				});
				const totalFiles = allEntries.filter((e) => e.isFile()).length;
				excludedCount = totalFiles - localFiles.length;
			} catch {
				// Config dir doesn't exist
			}

			totalSynced += localFiles.length;
			totalExcluded += excludedCount;
			perEnvironment[env.id] = {
				localModifications: envMods,
				syncedCount: localFiles.length,
				excludedCount,
			};
		}
	} else {
		// v1 flat mode or single-environment fallback
		const { claudeDir, homeDir } = resolveLegacyPaths(options);

		const localFiles = await scanDirectory(claudeDir);
		const repoFiles = await scanDirectory(syncRepoDir);

		const localFileSet = new Set(localFiles);
		const repoFileSet = new Set(repoFiles);

		for (const relativePath of localFiles) {
			if (!repoFileSet.has(relativePath)) {
				allModifications.push({ path: relativePath, type: "added" });
				continue;
			}
			const localContent = await fs.readFile(
				path.join(claudeDir, relativePath),
				"utf-8",
			);
			const repoContent = await fs.readFile(
				path.join(syncRepoDir, relativePath),
				"utf-8",
			);
			let normalizedLocal = localContent;
			if (path.basename(relativePath) === "settings.json") {
				normalizedLocal = rewritePathsForRepo(localContent, homeDir);
			}
			if (normalizedLocal !== repoContent) {
				allModifications.push({ path: relativePath, type: "modified" });
			}
		}

		for (const repoFile of repoFiles) {
			if (!localFileSet.has(repoFile)) {
				allModifications.push({ path: repoFile, type: "deleted" });
			}
		}

		// Count excluded files
		try {
			const allEntries = await fs.readdir(claudeDir, {
				recursive: true,
				withFileTypes: true,
			});
			totalExcluded = allEntries.filter((e) => e.isFile()).length - localFiles.length;
		} catch {
			// Can't read
		}
		totalSynced = localFiles.length;
	}

	return {
		localModifications: allModifications,
		remoteDrift: {
			ahead: gitStatus.ahead,
			behind: gitStatus.behind,
		},
		excludedCount: totalExcluded,
		syncedCount: totalSynced,
		branch: gitStatus.current,
		tracking: gitStatus.tracking,
		isClean:
			allModifications.length === 0 &&
			gitStatus.ahead === 0 &&
			gitStatus.behind === 0,
		hasRemote: remoteConfigured,
		perEnvironment: Object.keys(perEnvironment).length > 0 ? perEnvironment : undefined,
	};
}
