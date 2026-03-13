import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	ALL_ENVIRONMENTS,
	ClaudeEnvironment,
	getEnvironmentById,
	OpenCodeEnvironment,
} from "../../src/core/environment.js";

describe("environment", () => {
	describe("ClaudeEnvironment", () => {
		const claude = new ClaudeEnvironment();

		it("has id 'claude'", () => {
			expect(claude.id).toBe("claude");
		});

		it("has display name 'Claude Code'", () => {
			expect(claude.displayName).toBe("Claude Code");
		});

		it("config dir is ~/.claude", () => {
			expect(claude.getConfigDir()).toBe(path.join(os.homedir(), ".claude"));
		});

		it("has settings.json as sync target", () => {
			expect(claude.getSyncTargets()).toContain("settings.json");
		});

		it("has CLAUDE.md as sync target", () => {
			expect(claude.getSyncTargets()).toContain("CLAUDE.md");
		});

		it("has commands/ as sync target", () => {
			expect(claude.getSyncTargets()).toContain("commands/");
		});

		it("has plugin sync patterns", () => {
			expect(claude.getPluginSyncPatterns().length).toBeGreaterThan(0);
		});

		it("has plugin ignore patterns", () => {
			expect(claude.getIgnorePatterns()).toContain("plugins/install-counts-cache.json");
		});

		it("path rewrite targets include settings.json", () => {
			expect(claude.getPathRewriteTargets()).toContain("settings.json");
		});

		it("skills subdir is 'commands'", () => {
			expect(claude.getSkillsSubdir()).toBe("commands");
		});
	});

	describe("OpenCodeEnvironment", () => {
		const opencode = new OpenCodeEnvironment();

		it("has id 'opencode'", () => {
			expect(opencode.id).toBe("opencode");
		});

		it("has display name 'OpenCode'", () => {
			expect(opencode.displayName).toBe("OpenCode");
		});

		it("config dir defaults to ~/.config/opencode", () => {
			const expected = path.join(
				process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
				"opencode",
			);
			expect(opencode.getConfigDir()).toBe(expected);
		});

		it("has opencode.json as sync target", () => {
			expect(opencode.getSyncTargets()).toContain("opencode.json");
		});

		it("has command/ (singular) as sync target", () => {
			expect(opencode.getSyncTargets()).toContain("command/");
		});

		it("does not have commands/ (plural) as sync target", () => {
			expect(opencode.getSyncTargets()).not.toContain("commands/");
		});

		it("has no plugin sync patterns", () => {
			expect(opencode.getPluginSyncPatterns()).toHaveLength(0);
		});

		it("has no ignore patterns", () => {
			expect(opencode.getIgnorePatterns()).toHaveLength(0);
		});

		it("path rewrite targets include opencode.json", () => {
			expect(opencode.getPathRewriteTargets()).toContain("opencode.json");
		});

		it("skills subdir is 'command' (singular)", () => {
			expect(opencode.getSkillsSubdir()).toBe("command");
		});
	});

	describe("ALL_ENVIRONMENTS", () => {
		it("contains both claude and opencode", () => {
			const ids = ALL_ENVIRONMENTS.map((e) => e.id);
			expect(ids).toContain("claude");
			expect(ids).toContain("opencode");
		});

		it("has exactly 2 environments", () => {
			expect(ALL_ENVIRONMENTS).toHaveLength(2);
		});
	});

	describe("getEnvironmentById", () => {
		it("returns claude environment for 'claude'", () => {
			const env = getEnvironmentById("claude");
			expect(env).toBeDefined();
			expect(env?.id).toBe("claude");
		});

		it("returns opencode environment for 'opencode'", () => {
			const env = getEnvironmentById("opencode");
			expect(env).toBeDefined();
			expect(env?.id).toBe("opencode");
		});

		it("returns undefined for unknown id", () => {
			expect(getEnvironmentById("unknown")).toBeUndefined();
		});
	});
});
