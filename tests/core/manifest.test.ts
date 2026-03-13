import { describe, expect, it } from "vitest";
import {
	DEFAULT_SYNC_TARGETS,
	isPathAllowed,
	PLUGIN_IGNORE_PATTERNS,
	PLUGIN_SYNC_PATTERNS,
} from "../../src/core/manifest.js";

describe("manifest", () => {
	describe("DEFAULT_SYNC_TARGETS", () => {
		it("contains exactly 8 sync targets", () => {
			expect(DEFAULT_SYNC_TARGETS).toHaveLength(8);
		});

		it("contains the expected sync targets", () => {
			const expected = [
				"settings.json",
				"CLAUDE.md",
				"agents/",
				"commands/",
				"hooks/",
				"get-shit-done/",
				"package.json",
				"gsd-file-manifest.json",
			];
			expect([...DEFAULT_SYNC_TARGETS].sort()).toEqual([...expected].sort());
		});
	});

	describe("PLUGIN_SYNC_PATTERNS", () => {
		it("contains 3 plugin sync patterns", () => {
			expect(PLUGIN_SYNC_PATTERNS).toHaveLength(3);
		});

		it("contains the expected plugin sync patterns", () => {
			const expected = [
				"plugins/blocklist.json",
				"plugins/known_marketplaces.json",
				"plugins/marketplaces/",
			];
			expect([...PLUGIN_SYNC_PATTERNS].sort()).toEqual([...expected].sort());
		});
	});

	describe("PLUGIN_IGNORE_PATTERNS", () => {
		it("contains the plugin ignore pattern", () => {
			expect(PLUGIN_IGNORE_PATTERNS).toContain("plugins/install-counts-cache.json");
		});
	});

	describe("isPathAllowed", () => {
		it("allows settings.json", () => {
			expect(isPathAllowed("settings.json")).toBe(true);
		});

		it("allows CLAUDE.md", () => {
			expect(isPathAllowed("CLAUDE.md")).toBe(true);
		});

		it("allows nested files under allowed directories", () => {
			expect(isPathAllowed("agents/my-skill/SKILL.md")).toBe(true);
		});

		it("rejects files in projects/ directory", () => {
			expect(isPathAllowed("projects/foo.md")).toBe(false);
		});

		it("rejects files in debug/ directory", () => {
			expect(isPathAllowed("debug/logs.txt")).toBe(false);
		});

		it("rejects files in telemetry/ directory", () => {
			expect(isPathAllowed("telemetry/data.json")).toBe(false);
		});

		it("allows plugin sync patterns", () => {
			expect(isPathAllowed("plugins/blocklist.json")).toBe(true);
		});

		it("rejects plugin ignore patterns", () => {
			expect(isPathAllowed("plugins/install-counts-cache.json")).toBe(false);
		});

		it("allows files nested under plugin sync directories", () => {
			expect(isPathAllowed("plugins/marketplaces/some-repo/file.md")).toBe(true);
		});

		it("rejects unknown directories", () => {
			expect(isPathAllowed("unknown-new-directory/file.txt")).toBe(false);
		});
	});
});
