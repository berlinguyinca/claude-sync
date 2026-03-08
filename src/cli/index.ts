import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";

const program = new Command();

program
	.name("claude-sync")
	.description("Git-backed sync for ~/.claude")
	.version("0.1.0");

registerInitCommand(program);

export { program };

// Only parse when run directly (not imported as a module)
// Check if this file is the entry point
const isDirectRun =
	typeof process !== "undefined" &&
	process.argv[1] &&
	(process.argv[1].endsWith("/cli/index.ts") ||
		process.argv[1].endsWith("/cli.js"));

if (isDirectRun) {
	program.parse();
}
