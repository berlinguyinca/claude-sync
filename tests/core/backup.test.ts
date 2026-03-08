import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createBackup } from "../../src/core/backup.js";

describe("core/backup", () => {
	let tmpDir: string;
	let claudeDir: string;
	let backupBaseDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "backup-test-"));
		claudeDir = path.join(tmpDir, ".claude");
		backupBaseDir = path.join(tmpDir, "backups");
		await fs.mkdir(claudeDir, { recursive: true });
		await fs.mkdir(backupBaseDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	describe("createBackup", () => {
		it("copies only allowlisted files to timestamped directory", async () => {
			// Create allowlisted files
			await fs.writeFile(
				path.join(claudeDir, "CLAUDE.md"),
				"# Claude config",
			);
			await fs.writeFile(
				path.join(claudeDir, "settings.json"),
				'{"key":"value"}',
			);

			// Create non-allowlisted file
			await fs.mkdir(path.join(claudeDir, "projects"), { recursive: true });
			await fs.writeFile(
				path.join(claudeDir, "projects", "foo.json"),
				"{}",
			);

			const backupDir = await createBackup(claudeDir, backupBaseDir);

			// Allowlisted files should be present
			const claudeMd = await fs.readFile(
				path.join(backupDir, "CLAUDE.md"),
				"utf-8",
			);
			expect(claudeMd).toBe("# Claude config");

			const settingsJson = await fs.readFile(
				path.join(backupDir, "settings.json"),
				"utf-8",
			);
			expect(settingsJson).toBe('{"key":"value"}');

			// Non-allowlisted file should NOT be present
			await expect(
				fs.access(path.join(backupDir, "projects", "foo.json")),
			).rejects.toThrow();
		});

		it("creates backup directory with ISO-like timestamp", async () => {
			await fs.writeFile(
				path.join(claudeDir, "CLAUDE.md"),
				"content",
			);

			const backupDir = await createBackup(claudeDir, backupBaseDir);
			const dirName = path.basename(backupDir);

			// ISO-like timestamp pattern: YYYY-MM-DDTHH-MM-SS-MMMZ
			expect(dirName).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
		});

		it("preserves directory structure in backup", async () => {
			await fs.mkdir(path.join(claudeDir, "agents"), { recursive: true });
			await fs.writeFile(
				path.join(claudeDir, "agents", "default.md"),
				"agent config",
			);

			const backupDir = await createBackup(claudeDir, backupBaseDir);

			const agentFile = await fs.readFile(
				path.join(backupDir, "agents", "default.md"),
				"utf-8",
			);
			expect(agentFile).toBe("agent config");
		});

		it("throws if claudeDir does not exist", async () => {
			const nonExistent = path.join(tmpDir, "nonexistent");
			await expect(
				createBackup(nonExistent, backupBaseDir),
			).rejects.toThrow();
		});

		it("returns the backup directory path", async () => {
			await fs.writeFile(
				path.join(claudeDir, "CLAUDE.md"),
				"content",
			);

			const backupDir = await createBackup(claudeDir, backupBaseDir);

			expect(backupDir.startsWith(backupBaseDir)).toBe(true);
			const stat = await fs.stat(backupDir);
			expect(stat.isDirectory()).toBe(true);
		});
	});
});
