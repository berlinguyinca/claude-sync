import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	initRepo,
	isGitRepo,
	addFiles,
	commitFiles,
	writeGitattributes,
} from "../../src/git/repo.js";

describe("git/repo", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-test-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	describe("initRepo", () => {
		it("creates a new git repository at specified path", async () => {
			await initRepo(tmpDir);
			const gitDir = path.join(tmpDir, ".git");
			const stat = await fs.stat(gitDir);
			expect(stat.isDirectory()).toBe(true);
		});

		it("throws if directory does not exist", async () => {
			const nonExistent = path.join(tmpDir, "nope");
			await expect(initRepo(nonExistent)).rejects.toThrow();
		});
	});

	describe("isGitRepo", () => {
		it("returns true for initialized repo", async () => {
			await initRepo(tmpDir);
			const result = await isGitRepo(tmpDir);
			expect(result).toBe(true);
		});

		it("returns false for non-repo directory", async () => {
			const result = await isGitRepo(tmpDir);
			expect(result).toBe(false);
		});
	});

	describe("addFiles", () => {
		it("stages specified files in the repo", async () => {
			await initRepo(tmpDir);
			const testFile = "test.txt";
			await fs.writeFile(path.join(tmpDir, testFile), "hello");
			await addFiles(tmpDir, [testFile]);

			// Verify file is staged by checking git status
			const simpleGit = (await import("simple-git")).default;
			const git = simpleGit(tmpDir);
			const status = await git.status();
			expect(status.staged).toContain(testFile);
		});
	});

	describe("commitFiles", () => {
		it("creates a commit with the specified message", async () => {
			await initRepo(tmpDir);
			const testFile = "test.txt";
			await fs.writeFile(path.join(tmpDir, testFile), "hello");
			await addFiles(tmpDir, [testFile]);
			await commitFiles(tmpDir, "test commit message");

			const simpleGit = (await import("simple-git")).default;
			const git = simpleGit(tmpDir);
			const log = await git.log();
			expect(log.latest?.message).toBe("test commit message");
		});
	});

	describe("writeGitattributes", () => {
		it("creates .gitattributes with LF enforcement content", async () => {
			await writeGitattributes(tmpDir);
			const content = await fs.readFile(
				path.join(tmpDir, ".gitattributes"),
				"utf-8",
			);
			expect(content).toContain("* text=auto eol=lf");
			expect(content).toContain("*.json text eol=lf");
			expect(content).toContain("*.md text eol=lf");
			expect(content).toContain("*.js text eol=lf");
			expect(content).toContain("*.sh text eol=lf");
		});
	});
});
