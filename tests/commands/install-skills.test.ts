import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeEnvironment } from "../../src/core/environment.js";
import { installSkills } from "../../src/core/skills.js";

describe("install-skills", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "install-skills-test-"));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("installs skills into claude commands/ directory", async () => {
		const claudeDir = path.join(tmpDir, ".claude");
		await fs.mkdir(path.join(claudeDir, "commands"), { recursive: true });

		const result = await installSkills(claudeDir);
		expect(result.installed.length).toBeGreaterThan(0);
		expect(result.installed).toContain("sync.md");

		// Verify the file was actually written
		const content = await fs.readFile(path.join(claudeDir, "commands", "sync.md"), "utf-8");
		expect(content).toContain("ai-sync");
	});

	it("skips skills that are already up to date", async () => {
		const claudeDir = path.join(tmpDir, ".claude");
		await fs.mkdir(path.join(claudeDir, "commands"), { recursive: true });

		// Install once
		await installSkills(claudeDir);

		// Install again — should skip
		const result = await installSkills(claudeDir);
		expect(result.installed).toHaveLength(0);
		expect(result.skipped).toContain("sync.md");
	});

	it("updates skills when content has changed", async () => {
		const claudeDir = path.join(tmpDir, ".claude");
		const commandsDir = path.join(claudeDir, "commands");
		await fs.mkdir(commandsDir, { recursive: true });

		// Write an outdated version
		await fs.writeFile(path.join(commandsDir, "sync.md"), "old content");

		const result = await installSkills(claudeDir);
		expect(result.installed).toContain("sync.md");
	});

	it("installs environment-specific skills into correct targets", async () => {
		const claudeDir = path.join(tmpDir, ".claude");
		await fs.mkdir(path.join(claudeDir, "commands"), { recursive: true });

		// Create a test environment that points to our tmp dir
		const testEnv: InstanceType<typeof ClaudeEnvironment> = Object.create(ClaudeEnvironment.prototype);
		Object.defineProperty(testEnv, "id", { value: "claude" });
		Object.defineProperty(testEnv, "displayName", { value: "Claude Code" });
		testEnv.getConfigDir = () => claudeDir;
		testEnv.getSkillsSubdir = () => "commands";
		testEnv.getSyncTargets = () => ["settings.json", "CLAUDE.md", "commands/"];
		testEnv.getPluginSyncPatterns = () => [];
		testEnv.getIgnorePatterns = () => [];
		testEnv.getPathRewriteTargets = () => ["settings.json"];

		const result = await installSkills(claudeDir, [testEnv]);
		expect(result.installed.length).toBeGreaterThan(0);
		expect(result.perEnvironment).toBeDefined();
		expect(result.perEnvironment?.claude).toBeDefined();
	});

	it("creates commands/ directory if it does not exist", async () => {
		const claudeDir = path.join(tmpDir, ".claude");
		await fs.mkdir(claudeDir, { recursive: true });
		// Don't create commands/ — installSkills should create it

		const result = await installSkills(claudeDir);
		expect(result.installed.length).toBeGreaterThan(0);

		// Verify directory was created
		const stat = await fs.stat(path.join(claudeDir, "commands"));
		expect(stat.isDirectory()).toBe(true);
	});
});
