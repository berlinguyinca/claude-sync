import * as path from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { getEnabledEnvironmentInstances } from "../../core/env-config.js";
import { linkEnvironment, unlinkEnvironment } from "../../core/linker.js";
import { detectRepoVersion } from "../../core/migration.js";
import { getSyncRepoDir } from "../../platform/paths.js";

export function registerLinkCommand(program: Command): void {
	program
		.command("link")
		.description(
			"Replace local config files with symlinks to the sync repo (single source of truth)",
		)
		.option("--env <id>", "Only link a specific environment")
		.option("--repo <path>", "Path to the sync repo")
		.action(async (options: { env?: string; repo?: string }) => {
			try {
				const syncRepoDir = getSyncRepoDir(options.repo);
				const version = await detectRepoVersion(syncRepoDir);

				if (version !== 2) {
					console.error(
						pc.red(
							"Linking requires a v2 repo with per-environment subdirectories.\n" +
								"Run 'ai-sync migrate' first to upgrade your repo.",
						),
					);
					process.exitCode = 1;
					return;
				}

				let envs = getEnabledEnvironmentInstances();
				if (options.env) {
					envs = envs.filter((e) => e.id === options.env);
					if (envs.length === 0) {
						console.error(pc.red(`Environment "${options.env}" is not enabled.`));
						process.exitCode = 1;
						return;
					}
				}

				const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
				const backupDir = path.join(
					path.dirname(syncRepoDir),
					".ai-sync-backups",
					`pre-link-${timestamp}`,
				);

				for (const env of envs) {
					console.log(pc.cyan(`\nLinking ${env.displayName}...`));
					const result = await linkEnvironment(env, syncRepoDir, backupDir);

					if (result.linked.length > 0) {
						console.log(pc.green(`  Linked ${result.linked.length} target(s):`));
						for (const t of result.linked) {
							console.log(pc.dim(`    ${env.getConfigDir()}/${t} → ${syncRepoDir}/${env.id}/${t}`));
						}
					}

					if (result.backedUp.length > 0) {
						console.log(pc.yellow(`  Backed up ${result.backedUp.length} existing target(s) to:`));
						console.log(pc.dim(`    ${backupDir}/${env.id}/`));
					}

					if (result.skipped.length > 0) {
						console.log(
							pc.yellow(
								`  Skipped ${result.skipped.length} target(s) (need path rewriting, still use push/pull):`,
							),
						);
						for (const t of result.skipped) {
							console.log(pc.dim(`    ${t}`));
						}
					}

					if (result.linked.length === 0 && result.skipped.length === 0) {
						console.log(pc.dim("  Nothing to link (no targets found)"));
					}
				}

				console.log(
					pc.green(
						"\nDone. Linked targets are now live — edits in either location are reflected immediately.",
					),
				);
			} catch (err) {
				console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
				process.exitCode = 1;
			}
		});

	program
		.command("unlink")
		.description("Replace symlinks with copies of the repo content (revert link)")
		.option("--env <id>", "Only unlink a specific environment")
		.option("--repo <path>", "Path to the sync repo")
		.action(async (options: { env?: string; repo?: string }) => {
			try {
				const syncRepoDir = getSyncRepoDir(options.repo);

				let envs = getEnabledEnvironmentInstances();
				if (options.env) {
					envs = envs.filter((e) => e.id === options.env);
					if (envs.length === 0) {
						console.error(pc.red(`Environment "${options.env}" is not enabled.`));
						process.exitCode = 1;
						return;
					}
				}

				for (const env of envs) {
					console.log(pc.cyan(`\nUnlinking ${env.displayName}...`));
					const result = await unlinkEnvironment(env, syncRepoDir);

					if (result.linked.length > 0) {
						console.log(
							pc.green(`  Restored ${result.linked.length} target(s) as regular files/dirs`),
						);
					} else {
						console.log(pc.dim("  No symlinks found"));
					}
				}

				console.log(pc.green("\nDone. All targets are now independent copies."));
			} catch (err) {
				console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
				process.exitCode = 1;
			}
		});
}
