import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePush } from "../../src/cli/commands/push.js";
import { addFiles, addRemote, commitFiles, initRepo } from "../../src/git/repo.js";

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

	// Initial commit and push
	await fs.writeFile(path.join(syncRepoDir, ".gitkeep"), "");
	await addFiles(syncRepoDir, [".gitkeep"]);
	await commitFiles(syncRepoDir, "initial commit");
	await simpleGit(syncRepoDir).push("origin", "main");
	await simpleGit(syncRepoDir).branch(["--set-upstream-to=origin/main", "main"]);

	// Create claudeDir with allowlisted files
	await fs.mkdir(claudeDir, { recursive: true });
	await fs.writeFile(path.join(claudeDir, "CLAUDE.md"), "# My Config");
	await fs.writeFile(path.join(claudeDir, "settings.json"), JSON.stringify({ key: "value" }));

	return { bareDir, syncRepoDir, claudeDir };
}

describe("dry-run mode", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dry-run-test-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("push --dry-run reports changes without pushing", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		const result = await handlePush({
			repoPath: syncRepoDir,
			claudeDir,
			dryRun: true,
		});

		expect(result.dryRun).toBe(true);
		expect(result.pushed).toBe(false);
		expect(result.message).toContain("Dry run");
		expect(result.fileChanges.length).toBeGreaterThan(0);

		// Verify no commit was actually made
		const git = simpleGit(syncRepoDir);
		const log = await git.log();
		expect(log.latest?.message).toBe("initial commit");
	});

	it("push --dry-run leaves repo clean", async () => {
		const { syncRepoDir, claudeDir } = await createTestEnv(tmpDir);

		await handlePush({
			repoPath: syncRepoDir,
			claudeDir,
			dryRun: true,
		});

		// Repo should be clean after dry-run
		const status = await simpleGit(syncRepoDir).status();
		expect(status.isClean()).toBe(true);
	});
});
