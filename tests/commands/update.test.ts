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

// Import after mock setup
import { startupUpdateCheck } from "../../src/core/updater.js";

describe("updater", () => {
	beforeEach(() => {
		testInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), "updater-test-"));
	});

	afterEach(() => {
		fs.rmSync(testInstallDir, { recursive: true, force: true });
	});

	describe("startupUpdateCheck", () => {
		it("returns null when checked recently", async () => {
			// Write a recent check timestamp
			const checkFile = path.join(testInstallDir, ".last-update-check");
			fs.writeFileSync(checkFile, String(Date.now()));

			const result = await startupUpdateCheck();
			expect(result).toBeNull();
		});

		it("returns null on any error (never throws)", async () => {
			// testInstallDir has no git repo, so git commands will fail
			// startupUpdateCheck should swallow the error
			const result = await startupUpdateCheck();
			expect(result).toBeNull();
		});
	});
});
