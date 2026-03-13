import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePush } from "../../src/cli/commands/push.js";
import { addFiles, addRemote, commitFiles, initRepo } from "../../src/git/repo.js";

/**
 * Creates a full test environment with:
 * - A bare git repo (the "remote")
 * - A working sync repo (initialized + remote added + upstream tracking)
 * - A mock claudeDir with allowlisted files
 */
async function createTestEnv(baseDir: string) {
	const bareDir = path.join(baseDir, "bare.git");
	const syncRepoDir = path.join(baseDir, "sync-repo");
	const claudeDir = path.join(baseDir, "home", ".claude");

	// Create bare remote repo
	await fs.mkdir(bareDir, { recursive: true });
	await simpleGit(bareDir).init(true);

	// Create sync repo with remote
	await fs.mkdir(syncRepoDir, { recursive: true });
	await initRepo(syncRepoDir);
	await simpleGit(syncRepoDir).addConfig("user.email", "test@test.com");
	await simpleGit(syncRepoDir).addConfig("user.name", "Test");
	await addRemote(syncRepoDir, "origin", bareDir);

	// Create an initial commit and push so main branch exists on remote
	await fs.writeFile(path.join(syncRepoDir, ".gitkeep"), "");
	await addFiles(syncRepoDir, [".gitkeep"]);
	await commitFiles(syncRepoDir, "initial commit");
	await simpleGit(syncRepoDir).push("origin", "main");
	// Set upstream tracking
	await simpleGit(syncRepoDir).branch(["--set-upstream-to=origin/main", "main"]);

	// Create claudeDir with allowlisted files
	await fs.mkdir(claudeDir, { recursive: true });
	await fs.writeFile(path.join(claudeDir, "CLAUDE.md"), "# My Claude Config");
	await fs.writeFile(
		path.join(claudeDir, "settings.json"),
		JSON.stringify({ projectDir: path.join(baseDir, "home", "projects") }),
	);
	await fs.mkdir(path.join(claudeDir, "agents"), { recursive: true });
	await fs.writeFile(path.join(claudeDir, "agents", "default.md"), "agent config");

	return { bareDir, syncRepoDir, claudeDir, homeDir: path.join(baseDir, "home") };
}

describe("push command (integration)", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "push-cmd-test-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("pushes files and returns pushed: true with file count", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		const result = await handlePush({ repoPath: syncRepoDir, claudeDir });

		expect(result.pushed).toBe(true);
		expect(result.filesUpdated).toBeGreaterThan(0);
		expect(result.message).toContain("Pushed");
	});

	it("returns pushed: false when no changes", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		// First push
		await handlePush({ repoPath: syncRepoDir, claudeDir });

		// Second push -- no changes
		const result = await handlePush({ repoPath: syncRepoDir, claudeDir });

		expect(result.pushed).toBe(false);
		expect(result.message).toContain("No changes");
	});

	it("rewrites settings.json paths before pushing", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		await handlePush({ repoPath: syncRepoDir, claudeDir });

		const settingsContent = await fs.readFile(path.join(syncRepoDir, "settings.json"), "utf-8");
		expect(settingsContent).toContain("{{HOME}}");
		expect(settingsContent).not.toContain(tmpDir);
	});

	it("throws with 'No remote' when no remote configured", async () => {
		const noRemoteDir = path.join(tmpDir, "no-remote-repo");
		await fs.mkdir(noRemoteDir, { recursive: true });
		await initRepo(noRemoteDir);
		await simpleGit(noRemoteDir).addConfig("user.email", "test@test.com");
		await simpleGit(noRemoteDir).addConfig("user.name", "Test");
		await fs.writeFile(path.join(noRemoteDir, ".gitkeep"), "");
		await addFiles(noRemoteDir, [".gitkeep"]);
		await commitFiles(noRemoteDir, "initial");

		const claudeDir = path.join(tmpDir, "home", ".claude");
		await fs.mkdir(claudeDir, { recursive: true });
		await fs.writeFile(path.join(claudeDir, "CLAUDE.md"), "# Test");

		await expect(handlePush({ repoPath: noRemoteDir, claudeDir })).rejects.toThrow(/[Nn]o remote/);
	});
});
