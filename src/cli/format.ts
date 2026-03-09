import pc from "picocolors";
import type { FileChange } from "../core/sync-engine.js";

/**
 * Returns a colored single-character indicator for a file change type.
 */
export function changeTypeIndicator(type: FileChange["type"]): string {
	switch (type) {
		case "modified":
			return pc.yellow("M");
		case "added":
			return pc.green("A");
		case "deleted":
			return pc.red("D");
	}
}

/**
 * Prints file changes to stdout with colored indicators.
 */
export function printFileChanges(changes: FileChange[]): void {
	for (const change of changes) {
		console.log(`  ${changeTypeIndicator(change.type)} ${change.path}`);
	}
}
