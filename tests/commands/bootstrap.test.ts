import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBootstrap } from "../../src/cli/commands/bootstrap.js";
import { isGitRepo } from "../../src/git/repo.js";

/**
 * Creates a "remote" git repo with allowlisted files to use as clone source.
 * Returns the path to the repo directory.
 */
async function createRemoteRepo(baseDir: string): Promise<string> {
	const repoDir = path.join(baseDir, "remote-repo");
	await fs.mkdir(repoDir, { recursive: true });

	const git = simpleGit(repoDir);
	await git.init();
	await git.addConfig("user.email", "test@test.com");
	await git.addConfig("user.name", "Test");

	// Add allowlisted files
	await fs.writeFile(
		path.join(repoDir, "settings.json"),
		JSON.stringify({
			theme: "dark",
			hookPath: "{{HOME}}/.claude/hooks/test.js",
			configDir: "{{HOME}}/.claude/agents",
		}),
	);

	await fs.writeFile(
		path.join(repoDir, "CLAUDE.md"),
		"# Remote Claude Config\nInstructions from remote.\n",
	);

	await fs.mkdir(path.join(repoDir, "agents"), { recursive: true });
	await fs.writeFile(path.join(repoDir, "agents", "default.md"), "Default agent from remote");

	await git.add(".");
	await git.commit("feat: initial config");

	return repoDir;
}

describe("bootstrap command (integration)", () => {
	let tmpDir: string;
	let remoteRepoDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-test-"));
		remoteRepoDir = await createRemoteRepo(tmpDir);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("clones remote repo to sync repo dir", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const claudeDir = path.join(tmpDir, "new-machine", ".claude");

		await handleBootstrap({
			repoUrl: remoteRepoDir,
			repoPath: syncRepoDir,
			claudeDir,
		});

		const isRepo = await isGitRepo(syncRepoDir);
		expect(isRepo).toBe(true);
	});

	it("applies repo files to claudeDir with path expansion", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const newMachineHome = path.join(tmpDir, "new-machine");
		const claudeDir = path.join(newMachineHome, ".claude");

		await handleBootstrap({
			repoUrl: remoteRepoDir,
			repoPath: syncRepoDir,
			claudeDir,
		});

		// settings.json should have {{HOME}} expanded to the new machine home
		const settingsContent = await fs.readFile(path.join(claudeDir, "settings.json"), "utf-8");
		expect(settingsContent).toContain(newMachineHome);
		expect(settingsContent).not.toContain("{{HOME}}");

		// Other files should be present
		const claudeMd = await fs.readFile(path.join(claudeDir, "CLAUDE.md"), "utf-8");
		expect(claudeMd).toContain("Remote Claude Config");

		const agentMd = await fs.readFile(path.join(claudeDir, "agents", "default.md"), "utf-8");
		expect(agentMd).toContain("Default agent from remote");
	});

	it("creates claudeDir if it does not exist", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const claudeDir = path.join(tmpDir, "brand-new-machine", ".claude");

		// claudeDir does not exist yet
		await expect(fs.access(claudeDir)).rejects.toThrow();

		await handleBootstrap({
			repoUrl: remoteRepoDir,
			repoPath: syncRepoDir,
			claudeDir,
		});

		// Now it should exist with files
		const stat = await fs.stat(claudeDir);
		expect(stat.isDirectory()).toBe(true);

		await expect(fs.access(path.join(claudeDir, "CLAUDE.md"))).resolves.toBeUndefined();
	});

	it("creates backup if claudeDir has existing files", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const claudeDir = path.join(tmpDir, "existing-machine", ".claude");

		// Create existing files in claudeDir
		await fs.mkdir(claudeDir, { recursive: true });
		await fs.writeFile(
			path.join(claudeDir, "CLAUDE.md"),
			"# Original config that should be backed up\n",
		);

		const result = await handleBootstrap({
			repoUrl: remoteRepoDir,
			repoPath: syncRepoDir,
			claudeDir,
		});

		// Backup should have been created
		expect(result.backupDir).not.toBeNull();
		expect(result.backupDir).toBeTruthy();

		// Backup should contain the original file
		const backupClaude = await fs.readFile(
			path.join(result.backupDir as string, "CLAUDE.md"),
			"utf-8",
		);
		expect(backupClaude).toContain("Original config that should be backed up");

		// claudeDir should now have the remote content
		const currentClaude = await fs.readFile(path.join(claudeDir, "CLAUDE.md"), "utf-8");
		expect(currentClaude).toContain("Remote Claude Config");
	});

	it("errors if sync repo already exists without --force", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const claudeDir = path.join(tmpDir, "machine", ".claude");

		// Create an existing sync repo
		await fs.mkdir(syncRepoDir, { recursive: true });
		const git = simpleGit(syncRepoDir);
		await git.init();

		await expect(
			handleBootstrap({
				repoUrl: remoteRepoDir,
				repoPath: syncRepoDir,
				claudeDir,
			}),
		).rejects.toThrow("already exists");
	});

	it("re-clones with --force", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const claudeDir = path.join(tmpDir, "machine", ".claude");

		// Create an existing sync repo
		await fs.mkdir(syncRepoDir, { recursive: true });
		const git = simpleGit(syncRepoDir);
		await git.init();

		const result = await handleBootstrap({
			repoUrl: remoteRepoDir,
			repoPath: syncRepoDir,
			claudeDir,
			force: true,
		});

		expect(result.syncRepoDir).toBe(syncRepoDir);
		expect(result.filesApplied).toBeGreaterThan(0);

		// Should have cloned content
		const isRepo = await isGitRepo(syncRepoDir);
		expect(isRepo).toBe(true);
	});

	it("returns correct filesApplied count", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const claudeDir = path.join(tmpDir, "machine", ".claude");

		const result = await handleBootstrap({
			repoUrl: remoteRepoDir,
			repoPath: syncRepoDir,
			claudeDir,
		});

		// Remote repo has 3 allowlisted files: settings.json, CLAUDE.md, agents/default.md
		expect(result.filesApplied).toBe(3);
	});

	it("wraps clone error with actionable message", async () => {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const claudeDir = path.join(tmpDir, "machine", ".claude");

		await expect(
			handleBootstrap({
				repoUrl: "/nonexistent/invalid-repo-url-12345",
				repoPath: syncRepoDir,
				claudeDir,
			}),
		).rejects.toThrow("check your repository URL");
	});
});
