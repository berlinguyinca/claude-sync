import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	addFiles,
	addRemote,
	commitFiles,
	fetchRemote,
	getRemotes,
	getStatus,
	hasRemote,
	initRepo,
	isGitRepo,
	pullFromRemote,
	pushToRemote,
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
			const content = await fs.readFile(path.join(tmpDir, ".gitattributes"), "utf-8");
			expect(content).toContain("* text=auto eol=lf");
			expect(content).toContain("*.json text eol=lf");
			expect(content).toContain("*.md text eol=lf");
			expect(content).toContain("*.js text eol=lf");
			expect(content).toContain("*.sh text eol=lf");
		});
	});

	describe("network operations", () => {
		let bareDir: string;

		beforeEach(async () => {
			bareDir = await fs.mkdtemp(path.join(os.tmpdir(), "bare-repo-"));
			await simpleGit(bareDir).init(true);
			await initRepo(tmpDir);
			// Configure git user for commits in tmpDir
			await simpleGit(tmpDir).addConfig("user.email", "test@test.com");
			await simpleGit(tmpDir).addConfig("user.name", "Test");
		});

		afterEach(async () => {
			await fs.rm(bareDir, { recursive: true, force: true });
		});

		describe("hasRemote", () => {
			it("returns false before adding remote", async () => {
				const result = await hasRemote(tmpDir);
				expect(result).toBe(false);
			});

			it("returns true after adding remote", async () => {
				await addRemote(tmpDir, "origin", bareDir);
				const result = await hasRemote(tmpDir);
				expect(result).toBe(true);
			});
		});

		describe("addRemote", () => {
			it("adds a remote that appears in getRemotes", async () => {
				await addRemote(tmpDir, "origin", bareDir);
				const remotes = await getRemotes(tmpDir);
				expect(remotes.length).toBe(1);
				expect(remotes[0].name).toBe("origin");
			});
		});

		describe("getRemotes", () => {
			it("returns empty array when no remotes configured", async () => {
				const remotes = await getRemotes(tmpDir);
				expect(remotes).toEqual([]);
			});

			it("returns remotes with refs", async () => {
				await addRemote(tmpDir, "origin", bareDir);
				const remotes = await getRemotes(tmpDir);
				expect(remotes[0].refs).toBeDefined();
			});
		});

		describe("getStatus", () => {
			it("returns StatusResult with isClean true on clean repo", async () => {
				// Need at least one commit
				await fs.writeFile(path.join(tmpDir, "init.txt"), "init");
				await addFiles(tmpDir, ["init.txt"]);
				await commitFiles(tmpDir, "initial commit");

				const status = await getStatus(tmpDir);
				expect(status.isClean()).toBe(true);
			});

			it("returns modified files when there are changes", async () => {
				await fs.writeFile(path.join(tmpDir, "init.txt"), "init");
				await addFiles(tmpDir, ["init.txt"]);
				await commitFiles(tmpDir, "initial commit");

				await fs.writeFile(path.join(tmpDir, "init.txt"), "modified");
				const status = await getStatus(tmpDir);
				expect(status.isClean()).toBe(false);
				expect(status.modified).toContain("init.txt");
			});
		});

		describe("pushToRemote", () => {
			it("pushes committed content to bare remote", async () => {
				await addRemote(tmpDir, "origin", bareDir);
				await fs.writeFile(path.join(tmpDir, "file.txt"), "content");
				await addFiles(tmpDir, ["file.txt"]);
				await commitFiles(tmpDir, "test commit");

				const result = await pushToRemote(tmpDir);
				expect(result).toBeDefined();

				// Verify content is in bare repo by cloning
				const cloneDir = await fs.mkdtemp(path.join(os.tmpdir(), "clone-test-"));
				await simpleGit(cloneDir).clone(bareDir, ".");
				const content = await fs.readFile(path.join(cloneDir, "file.txt"), "utf-8");
				expect(content).toBe("content");
				await fs.rm(cloneDir, { recursive: true, force: true });
			});
		});

		describe("pullFromRemote", () => {
			it("pulls changes from remote", async () => {
				await addRemote(tmpDir, "origin", bareDir);
				await fs.writeFile(path.join(tmpDir, "file.txt"), "original");
				await addFiles(tmpDir, ["file.txt"]);
				await commitFiles(tmpDir, "initial commit");
				await pushToRemote(tmpDir);

				// Clone, modify, and push from clone
				const cloneDir = await fs.mkdtemp(path.join(os.tmpdir(), "clone-pull-"));
				await simpleGit(cloneDir).clone(bareDir, ".");
				await simpleGit(cloneDir).addConfig("user.email", "test@test.com");
				await simpleGit(cloneDir).addConfig("user.name", "Test");
				await fs.writeFile(path.join(cloneDir, "file.txt"), "updated");
				await simpleGit(cloneDir).add("file.txt");
				await simpleGit(cloneDir).commit("update from clone");
				await simpleGit(cloneDir).push("origin", "main");

				// Pull in original repo
				const result = await pullFromRemote(tmpDir);
				expect(result).toBeDefined();

				const content = await fs.readFile(path.join(tmpDir, "file.txt"), "utf-8");
				expect(content).toBe("updated");
				await fs.rm(cloneDir, { recursive: true, force: true });
			});
		});

		describe("fetchRemote", () => {
			it("fetches without merging", async () => {
				await addRemote(tmpDir, "origin", bareDir);
				await fs.writeFile(path.join(tmpDir, "file.txt"), "original");
				await addFiles(tmpDir, ["file.txt"]);
				await commitFiles(tmpDir, "initial commit");
				await pushToRemote(tmpDir);

				// Set up upstream tracking so status reports ahead/behind
				await simpleGit(tmpDir).branch(["--set-upstream-to=origin/main", "main"]);

				// Clone, modify, and push from clone
				const cloneDir = await fs.mkdtemp(path.join(os.tmpdir(), "clone-fetch-"));
				await simpleGit(cloneDir).clone(bareDir, ".");
				await simpleGit(cloneDir).addConfig("user.email", "test@test.com");
				await simpleGit(cloneDir).addConfig("user.name", "Test");
				await fs.writeFile(path.join(cloneDir, "new.txt"), "new content");
				await simpleGit(cloneDir).add("new.txt");
				await simpleGit(cloneDir).commit("add new file");
				await simpleGit(cloneDir).push("origin", "main");

				// Fetch in original repo (should NOT merge)
				const result = await fetchRemote(tmpDir);
				expect(result).toBeDefined();

				// File should NOT exist locally (fetch doesn't merge)
				await expect(fs.access(path.join(tmpDir, "new.txt"))).rejects.toThrow();

				// Status should show behind after fetch with tracking
				const status = await getStatus(tmpDir);
				expect(status.behind).toBeGreaterThan(0);

				await fs.rm(cloneDir, { recursive: true, force: true });
			});
		});
	});
});
