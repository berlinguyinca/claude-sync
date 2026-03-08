export {
	DEFAULT_SYNC_TARGETS,
	PLUGIN_SYNC_PATTERNS,
	PLUGIN_IGNORE_PATTERNS,
	isPathAllowed,
} from "./core/manifest.js";
export { scanDirectory } from "./core/scanner.js";
export { rewritePathsForRepo, expandPathsForLocal } from "./core/path-rewriter.js";
export { getHomeDir, getClaudeDir, getSyncRepoDir } from "./platform/paths.js";
export {
	initRepo,
	isGitRepo,
	addFiles,
	commitFiles,
	writeGitattributes,
	pushToRemote,
	pullFromRemote,
	fetchRemote,
	getStatus,
	addRemote,
	getRemotes,
	hasRemote,
} from "./git/repo.js";
export { createBackup } from "./core/backup.js";
