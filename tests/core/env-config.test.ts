import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to mock getInstallDir since it walks up from the running script
vi.mock("../../src/platform/paths.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		getInstallDir: () => testInstallDir,
	};
});

let testInstallDir: string;

import {
	getEnabledEnvironmentInstances,
	getEnabledEnvironments,
	setEnabledEnvironments,
} from "../../src/core/env-config.js";

describe("env-config", () => {
	beforeEach(() => {
		testInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-config-test-"));
	});

	afterEach(() => {
		fs.rmSync(testInstallDir, { recursive: true, force: true });
	});

	describe("getEnabledEnvironments", () => {
		it("defaults to ['claude'] when no config file exists", () => {
			const result = getEnabledEnvironments();
			expect(result).toEqual(["claude"]);
		});

		it("reads environments from config file", () => {
			fs.writeFileSync(
				path.join(testInstallDir, ".environments.json"),
				JSON.stringify(["claude", "opencode"]),
			);
			const result = getEnabledEnvironments();
			expect(result).toEqual(["claude", "opencode"]);
		});

		it("defaults to ['claude'] if config file is malformed", () => {
			fs.writeFileSync(path.join(testInstallDir, ".environments.json"), "not valid json");
			const result = getEnabledEnvironments();
			expect(result).toEqual(["claude"]);
		});

		it("defaults to ['claude'] if config contains non-strings", () => {
			fs.writeFileSync(path.join(testInstallDir, ".environments.json"), JSON.stringify([1, 2, 3]));
			const result = getEnabledEnvironments();
			expect(result).toEqual(["claude"]);
		});
	});

	describe("setEnabledEnvironments", () => {
		it("writes environments to config file", () => {
			setEnabledEnvironments(["claude", "opencode"]);
			const content = fs.readFileSync(path.join(testInstallDir, ".environments.json"), "utf-8");
			expect(JSON.parse(content)).toEqual(["claude", "opencode"]);
		});

		it("throws for unknown environment id", () => {
			expect(() => setEnabledEnvironments(["unknown"])).toThrow(/Unknown environment/);
		});

		it("throws when trying to set empty array", () => {
			expect(() => setEnabledEnvironments([])).toThrow(/at least one environment/i);
		});
	});

	describe("getEnabledEnvironmentInstances", () => {
		it("returns Environment instances for enabled envs", () => {
			fs.writeFileSync(path.join(testInstallDir, ".environments.json"), JSON.stringify(["claude"]));
			const instances = getEnabledEnvironmentInstances();
			expect(instances).toHaveLength(1);
			expect(instances[0].id).toBe("claude");
		});

		it("returns multiple environments when configured", () => {
			fs.writeFileSync(
				path.join(testInstallDir, ".environments.json"),
				JSON.stringify(["claude", "opencode"]),
			);
			const instances = getEnabledEnvironmentInstances();
			expect(instances).toHaveLength(2);
			expect(instances.map((e) => e.id)).toEqual(["claude", "opencode"]);
		});
	});
});
