import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectRepoVersion, migrateToV2 } from "../../src/core/migration.js";
import {
	addFiles,
	addRemote,
	commitFiles,
	initRepo,
	writeGitattributes,
} from "../../src/git/repo.js";

describe("migration", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "migration-test-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	async function createV1Repo(): Promise<string> {
		const syncRepoDir = path.join(tmpDir, "sync-repo");
		const bareDir = path.join(tmpDir, "bare.git");

		// Create bare remote
		await fs.mkdir(bareDir, { recursive: true });
		await simpleGit(bareDir).init(true);

		// Create sync repo
		await fs.mkdir(syncRepoDir, { recursive: true });
		await initRepo(syncRepoDir);
		await simpleGit(syncRepoDir).addConfig("user.email", "test@test.com");
		await simpleGit(syncRepoDir).addConfig("user.name", "Test");
		await addRemote(syncRepoDir, "origin", bareDir);

		// Write .gitattributes
		await writeGitattributes(syncRepoDir);
		await addFiles(syncRepoDir, [".gitattributes"]);
		await commitFiles(syncRepoDir, "chore: init");
		await simpleGit(syncRepoDir).push("origin", "main");
		await simpleGit(syncRepoDir).branch(["--set-upstream-to=origin/main", "main"]);

		// Add some allowlisted files at root (v1 format)
		await fs.writeFile(path.join(syncRepoDir, "CLAUDE.md"), "# Config");
		await fs.writeFile(path.join(syncRepoDir, "settings.json"), JSON.stringify({ key: "value" }));
		await fs.mkdir(path.join(syncRepoDir, "agents"), { recursive: true });
		await fs.writeFile(path.join(syncRepoDir, "agents", "default.md"), "agent");

		await addFiles(syncRepoDir, ["."]);
		await commitFiles(syncRepoDir, "feat: initial sync");
		await simpleGit(syncRepoDir).push("origin", "main");

		return syncRepoDir;
	}

	describe("detectRepoVersion", () => {
		it("returns 1 for repos without .sync-version file", async () => {
			const repoDir = await createV1Repo();
			const version = await detectRepoVersion(repoDir);
			expect(version).toBe(1);
		});

		it("returns 2 for repos with .sync-version containing '2'", async () => {
			const repoDir = await createV1Repo();
			await fs.writeFile(path.join(repoDir, ".sync-version"), "2\n");
			const version = await detectRepoVersion(repoDir);
			expect(version).toBe(2);
		});

		it("returns 1 for repos with .sync-version containing other content", async () => {
			const repoDir = await createV1Repo();
			await fs.writeFile(path.join(repoDir, ".sync-version"), "unknown");
			const version = await detectRepoVersion(repoDir);
			expect(version).toBe(1);
		});
	});

	describe("migrateToV2", () => {
		it("moves root-level files into claude/ subdirectory", async () => {
			const repoDir = await createV1Repo();
			const result = await migrateToV2(repoDir);

			// Files should be in claude/ subdirectory
			const claudeMd = await fs.readFile(path.join(repoDir, "claude", "CLAUDE.md"), "utf-8");
			expect(claudeMd).toBe("# Config");

			const settingsJson = await fs.readFile(
				path.join(repoDir, "claude", "settings.json"),
				"utf-8",
			);
			expect(settingsJson).toContain("value");

			const agent = await fs.readFile(
				path.join(repoDir, "claude", "agents", "default.md"),
				"utf-8",
			);
			expect(agent).toBe("agent");

			// Root-level files should be gone
			await expect(fs.access(path.join(repoDir, "CLAUDE.md"))).rejects.toThrow();

			expect(result.movedFiles.length).toBe(3);
		});

		it("writes .sync-version with content '2'", async () => {
			const repoDir = await createV1Repo();
			await migrateToV2(repoDir);

			const version = await fs.readFile(path.join(repoDir, ".sync-version"), "utf-8");
			expect(version.trim()).toBe("2");
		});

		it("creates a commit with migration message", async () => {
			const repoDir = await createV1Repo();
			await migrateToV2(repoDir);

			const git = simpleGit(repoDir);
			const log = await git.log();
			expect(log.latest?.message).toBe("chore: migrate to v2 multi-environment repo structure");
		});

		it("returns already-at-v2 message for v2 repos", async () => {
			const repoDir = await createV1Repo();
			await fs.writeFile(path.join(repoDir, ".sync-version"), "2\n");

			const result = await migrateToV2(repoDir);
			expect(result.movedFiles).toHaveLength(0);
			expect(result.message).toContain("Already at v2");
		});

		it("throws if repo has uncommitted changes", async () => {
			const repoDir = await createV1Repo();
			// Create an uncommitted file
			await fs.writeFile(path.join(repoDir, "uncommitted.txt"), "dirty");
			await simpleGit(repoDir).add("uncommitted.txt");

			await expect(migrateToV2(repoDir)).rejects.toThrow(/uncommitted changes/i);
		});

		it("detectRepoVersion returns 2 after migration", async () => {
			const repoDir = await createV1Repo();
			await migrateToV2(repoDir);

			const version = await detectRepoVersion(repoDir);
			expect(version).toBe(2);
		});
	});
});
