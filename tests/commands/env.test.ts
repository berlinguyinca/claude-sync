import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/platform/paths.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		getInstallDir: () => testInstallDir,
	};
});

let testInstallDir: string;

import { getEnabledEnvironments, setEnabledEnvironments } from "../../src/core/env-config.js";
import { ALL_ENVIRONMENTS, getEnvironmentById } from "../../src/core/environment.js";

describe("env command logic", () => {
	beforeEach(() => {
		testInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-cmd-test-"));
	});

	afterEach(() => {
		fs.rmSync(testInstallDir, { recursive: true, force: true });
	});

	describe("env list", () => {
		it("all known environments are listed", () => {
			expect(ALL_ENVIRONMENTS.length).toBeGreaterThanOrEqual(2);
			const ids = ALL_ENVIRONMENTS.map((e) => e.id);
			expect(ids).toContain("claude");
			expect(ids).toContain("opencode");
		});

		it("each environment has a display name and config dir", () => {
			for (const env of ALL_ENVIRONMENTS) {
				expect(env.displayName).toBeTruthy();
				expect(env.getConfigDir()).toBeTruthy();
			}
		});
	});

	describe("env enable", () => {
		it("enables a new environment", () => {
			const initial = getEnabledEnvironments();
			expect(initial).toEqual(["claude"]);

			setEnabledEnvironments([...initial, "opencode"]);
			expect(getEnabledEnvironments()).toEqual(["claude", "opencode"]);
		});

		it("rejects unknown environment ids", () => {
			expect(() => setEnabledEnvironments(["claude", "unknown"])).toThrow(/Unknown environment/);
		});

		it("is idempotent — enabling already-enabled env is safe", () => {
			setEnabledEnvironments(["claude"]);
			const before = getEnabledEnvironments();
			setEnabledEnvironments(["claude"]);
			expect(getEnabledEnvironments()).toEqual(before);
		});
	});

	describe("env disable", () => {
		it("disables an environment by filtering it out", () => {
			setEnabledEnvironments(["claude", "opencode"]);
			setEnabledEnvironments(["claude"]);
			expect(getEnabledEnvironments()).toEqual(["claude"]);
		});

		it("cannot disable all environments", () => {
			expect(() => setEnabledEnvironments([])).toThrow(/at least one environment/i);
		});
	});

	describe("getEnvironmentById", () => {
		it("returns environment for known ids", () => {
			expect(getEnvironmentById("claude")).toBeDefined();
			expect(getEnvironmentById("opencode")).toBeDefined();
		});

		it("returns undefined for unknown ids", () => {
			expect(getEnvironmentById("unknown")).toBeUndefined();
		});
	});
});
