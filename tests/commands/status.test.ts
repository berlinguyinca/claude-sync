import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePush } from "../../src/cli/commands/push.js";
import { handleStatus } from "../../src/cli/commands/status.js";
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

describe("status command (integration)", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "status-cmd-test-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("returns isClean: true when everything matches", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		// Push to establish baseline
		await handlePush({ repoPath: syncRepoDir, claudeDir });

		const result = await handleStatus({ repoPath: syncRepoDir, claudeDir });

		expect(result.isClean).toBe(true);
		expect(result.localModifications).toHaveLength(0);
	});

	it("detects modified files", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		// Push to establish baseline
		await handlePush({ repoPath: syncRepoDir, claudeDir });

		// Modify a file locally
		await fs.writeFile(path.join(claudeDir, "CLAUDE.md"), "# Modified content");

		const result = await handleStatus({ repoPath: syncRepoDir, claudeDir });

		expect(result.isClean).toBe(false);
		const modifiedPaths = result.localModifications.map((c) => c.path);
		expect(modifiedPaths).toContain("CLAUDE.md");
		const change = result.localModifications.find((c) => c.path === "CLAUDE.md");
		expect(change?.type).toBe("modified");
	});

	it("detects added files", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		// Push to establish baseline
		await handlePush({ repoPath: syncRepoDir, claudeDir });

		// Add a new allowlisted file
		await fs.mkdir(path.join(claudeDir, "commands"), { recursive: true });
		await fs.writeFile(path.join(claudeDir, "commands", "custom.md"), "custom");

		const result = await handleStatus({ repoPath: syncRepoDir, claudeDir });

		const addedPaths = result.localModifications.map((c) => c.path);
		expect(addedPaths).toContain("commands/custom.md");
		const change = result.localModifications.find((c) => c.path === "commands/custom.md");
		expect(change?.type).toBe("added");
	});

	it("reports excluded file count", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		// Add non-allowlisted files
		await fs.mkdir(path.join(claudeDir, "projects"), { recursive: true });
		await fs.writeFile(path.join(claudeDir, "projects", "data.json"), "{}");

		// Push to establish baseline
		await handlePush({ repoPath: syncRepoDir, claudeDir });

		const result = await handleStatus({ repoPath: syncRepoDir, claudeDir });

		expect(result.excludedCount).toBeGreaterThan(0);
	});

	it("returns hasRemote: false when no remote configured", async () => {
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

		const result = await handleStatus({ repoPath: noRemoteDir, claudeDir });

		expect(result.hasRemote).toBe(false);
		expect(result.remoteDrift.ahead).toBe(0);
		expect(result.remoteDrift.behind).toBe(0);
	});
});
