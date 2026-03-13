import type { Command } from "commander";
import pc from "picocolors";
import { detectRepoVersion, migrateToV2 } from "../../core/migration.js";
import { getSyncRepoDir } from "../../platform/paths.js";

/**
 * Registers the "migrate" subcommand on the CLI program.
 */
export function registerMigrateCommand(program: Command): void {
	program
		.command("migrate")
		.description("Migrate sync repo from v1 (flat) to v2 (multi-environment subdirectories)")
		.option("--repo-path <path>", "Custom sync repo path", getSyncRepoDir())
		.action(async (opts: { repoPath: string }) => {
			try {
				const version = await detectRepoVersion(opts.repoPath);
				if (version === 2) {
					console.log(pc.yellow("Repo is already at v2 format — nothing to migrate"));
					return;
				}

				console.log(pc.dim("Migrating sync repo to v2 multi-environment format..."));
				const result = await migrateToV2(opts.repoPath);

				console.log(pc.green(result.message));
				if (result.movedFiles.length > 0) {
					console.log(pc.dim(`Moved ${result.movedFiles.length} files into claude/ subdirectory`));
				}
				console.log(
					pc.dim("You can now enable additional environments with: ai-sync env enable opencode"),
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(pc.red(`Migration failed: ${message}`));
				process.exitCode = 1;
			}
		});
}
