import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getClaudeDir } from "../platform/paths.js";
import type { Environment } from "./environment.js";

/**
 * Finds the skills source directory by walking up from the running module.
 */
async function findSkillsDir(): Promise<string> {
	const thisFile = fileURLToPath(import.meta.url);
	let dir = path.dirname(thisFile);

	for (let i = 0; i < 5; i++) {
		const candidate = path.join(dir, "skills");
		try {
			const stat = await fs.stat(candidate);
			if (stat.isDirectory()) return candidate;
		} catch {
			// not here, keep going up
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	throw new Error("Could not find skills/ directory in ai-sync installation");
}

/**
 * Parses a skill filename to determine its target environment and install name.
 *
 * Convention:
 *   <name>.<envId>.md  → installs as <name>.md only into environment <envId>
 *   <name>.md          → installs as <name>.md into all environments
 *
 * Examples:
 *   sync.claude.md     → installs as sync.md into Claude Code only
 *   sync.opencode.md   → installs as sync.md into OpenCode only
 *   utils.md           → installs as utils.md into all environments
 */
function parseSkillFilename(filename: string): { installName: string; targetEnvId: string | null } {
	// Match pattern: <name>.<envId>.md
	const match = filename.match(/^(.+)\.([a-z]+)\.md$/);
	if (match) {
		return { installName: `${match[1]}.md`, targetEnvId: match[2] };
	}
	return { installName: filename, targetEnvId: null };
}

export interface InstallSkillsResult {
	installed: string[];
	skipped: string[];
	perEnvironment?: Record<string, { installed: string[]; skipped: string[] }>;
}

/**
 * Installs ai-sync skill files into slash-command directories.
 *
 * Skills are filtered per environment using the filename convention:
 *   <name>.<envId>.md  → only installed into the matching environment
 *   <name>.md          → installed into all environments
 *
 * When called with environments, installs into each environment's skills subdirectory.
 * Falls back to ~/.claude/commands/ for backward compatibility.
 */
export async function installSkills(
	claudeDir?: string,
	environments?: Environment[],
): Promise<InstallSkillsResult> {
	const skillsDir = await findSkillsDir();
	const entries = await fs.readdir(skillsDir);
	const mdFiles = entries.filter((f) => f.endsWith(".md"));

	const allInstalled: string[] = [];
	const allSkipped: string[] = [];
	const perEnvironment: Record<string, { installed: string[]; skipped: string[] }> = {};

	if (environments && environments.length > 0) {
		for (const env of environments) {
			const subdir = env.getSkillsSubdir();
			if (!subdir) continue;

			const targetBase = path.join(env.getConfigDir(), subdir);
			await fs.mkdir(targetBase, { recursive: true });

			const envInstalled: string[] = [];
			const envSkipped: string[] = [];

			for (const file of mdFiles) {
				const { installName, targetEnvId } = parseSkillFilename(file);

				// Skip skills targeted at a different environment
				if (targetEnvId !== null && targetEnvId !== env.id) {
					continue;
				}

				const src = path.join(skillsDir, file);
				const dest = path.join(targetBase, installName);
				const srcContent = await fs.readFile(src, "utf-8");

				try {
					const destContent = await fs.readFile(dest, "utf-8");
					if (destContent === srcContent) {
						envSkipped.push(installName);
						continue;
					}
				} catch {
					// file doesn't exist yet
				}

				await fs.writeFile(dest, srcContent);
				envInstalled.push(installName);
			}

			perEnvironment[env.id] = { installed: envInstalled, skipped: envSkipped };
			allInstalled.push(...envInstalled.filter((f) => !allInstalled.includes(f)));
			allSkipped.push(
				...envSkipped.filter((f) => !allSkipped.includes(f) && !allInstalled.includes(f)),
			);
		}
	} else {
		// Legacy single-directory mode — only install claude-targeted or generic skills
		const targetBase = path.join(claudeDir ?? getClaudeDir(), "commands");
		await fs.mkdir(targetBase, { recursive: true });

		for (const file of mdFiles) {
			const { installName, targetEnvId } = parseSkillFilename(file);

			// In legacy mode, skip skills targeted at non-claude environments
			if (targetEnvId !== null && targetEnvId !== "claude") {
				continue;
			}

			const src = path.join(skillsDir, file);
			const dest = path.join(targetBase, installName);
			const srcContent = await fs.readFile(src, "utf-8");

			try {
				const destContent = await fs.readFile(dest, "utf-8");
				if (destContent === srcContent) {
					allSkipped.push(installName);
					continue;
				}
			} catch {
				// file doesn't exist yet
			}

			await fs.writeFile(dest, srcContent);
			allInstalled.push(installName);
		}
	}

	return {
		installed: allInstalled,
		skipped: allSkipped,
		perEnvironment: Object.keys(perEnvironment).length > 0 ? perEnvironment : undefined,
	};
}
