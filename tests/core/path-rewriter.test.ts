import { describe, expect, it } from "vitest";
import { expandPathsForLocal, rewritePathsForRepo } from "../../src/core/path-rewriter.js";

describe("path-rewriter", () => {
	describe("rewritePathsForRepo", () => {
		it("replaces home directory with {{HOME}} token", () => {
			const content = '{"path": "/Users/wohlgemuth/.claude/settings.json"}';
			const result = rewritePathsForRepo(content, "/Users/wohlgemuth");
			expect(result).toBe('{"path": "{{HOME}}/.claude/settings.json"}');
		});

		it("handles multiple path occurrences in one file", () => {
			const content = [
				'{"first": "/Users/wohlgemuth/.claude/a",',
				'"second": "/Users/wohlgemuth/.claude/b"}',
			].join("\n");
			const result = rewritePathsForRepo(content, "/Users/wohlgemuth");
			expect(result).not.toContain("/Users/wohlgemuth");
			expect(result).toContain("{{HOME}}/.claude/a");
			expect(result).toContain("{{HOME}}/.claude/b");
		});

		it("does not modify content without home dir paths", () => {
			const content = '{"key": "value", "count": 42}';
			const result = rewritePathsForRepo(content, "/Users/wohlgemuth");
			expect(result).toBe(content);
		});

		it("handles home dirs with special regex characters", () => {
			const content = '{"path": "/home/user.name/.claude/config"}';
			const result = rewritePathsForRepo(content, "/home/user.name");
			expect(result).toBe('{"path": "{{HOME}}/.claude/config"}');
		});
	});

	describe("expandPathsForLocal", () => {
		it("replaces {{HOME}} token with provided home directory", () => {
			const content = '{"path": "{{HOME}}/.claude/settings.json"}';
			const result = expandPathsForLocal(content, "/Users/testuser");
			expect(result).toBe('{"path": "/Users/testuser/.claude/settings.json"}');
		});

		it("handles multiple token occurrences", () => {
			const content = [
				'{"first": "{{HOME}}/.claude/a",',
				'"second": "{{HOME}}/.claude/b"}',
			].join("\n");
			const result = expandPathsForLocal(content, "/home/linux-user");
			expect(result).not.toContain("{{HOME}}");
			expect(result).toContain("/home/linux-user/.claude/a");
			expect(result).toContain("/home/linux-user/.claude/b");
		});
	});

	describe("roundtrip", () => {
		it("preserves content structure through rewrite and expand", () => {
			const original = JSON.stringify(
				{
					editor: "/Users/machineA/.claude/extensions/vscode",
					backup: "/Users/machineA/.config/backup",
					plain: "no paths here",
				},
				null,
				2,
			);
			const rewritten = rewritePathsForRepo(original, "/Users/machineA");
			const expanded = expandPathsForLocal(rewritten, "/home/machineB");

			expect(expanded).toContain("/home/machineB/.claude/extensions/vscode");
			expect(expanded).toContain("/home/machineB/.config/backup");
			expect(expanded).toContain("no paths here");
			expect(expanded).not.toContain("/Users/machineA");
			expect(expanded).not.toContain("{{HOME}}");
		});
	});
});
