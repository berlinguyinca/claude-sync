# Phase 3: Cross-Platform and Bootstrap - Research

**Researched:** 2026-03-08
**Domain:** Cross-platform path normalization, bootstrap (clone) command, line-ending safety
**Confidence:** HIGH

## Summary

Phase 3 addresses two requirements: SETUP-01 (bootstrap a new machine from a remote repo with one command) and SETUP-02 (identical behavior on macOS, Linux, and Windows/WSL). The bootstrap command is architecturally straightforward -- it is the inverse of `init`: clone the remote repo to `~/.claude-sync`, then apply files to `~/.claude` using the same copy-and-expand logic as `syncPull`. The cross-platform work is more nuanced and includes a genuine bug in the existing codebase that must be fixed.

The core cross-platform issue is **path separator mismatch**. The manifest (`isPathAllowed`) uses forward-slash patterns like `"agents/"`, but Node.js `path.relative()` returns backslash-separated paths on Windows (e.g., `"agents\\default.md"`). This means `relativePath.startsWith("agents/")` fails silently on Windows, causing the scanner to reject ALL directory-based allowlist entries. The fix is to normalize all relative paths to forward slashes before passing them to `isPathAllowed`. This same normalization must be applied everywhere relative paths flow through the system: scanner, sync-engine comparisons, and file copy operations.

The path token system (`{{HOME}}`) already handles the critical cross-platform path difference (different home directories), but it must also handle path separators in the stored content. Settings.json hook commands reference paths with the source platform's separators. When stored in the repo, these should use forward slashes (POSIX-normalized), and on expansion the `{{HOME}}` token should expand to the platform-native home directory. Since Claude Code on WSL runs as a Linux process, it expects POSIX paths, so forward-slash normalization in the repo is correct.

**Primary recommendation:** Normalize all internal relative paths to forward slashes (POSIX-style) using a utility function, fix the scanner/manifest interaction for Windows, add a `bootstrap` CLI command that clones + applies, and add cross-platform tests that simulate Windows-style paths.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETUP-01 | User can bootstrap a new machine from an existing remote repo with one command | Bootstrap command: `claude-sync bootstrap <repo-url>` clones to `~/.claude-sync`, applies to `~/.claude` with path expansion. Reuses existing `syncPull` logic after initial clone. |
| SETUP-02 | Tool works identically on macOS, Linux, and Windows/WSL | Path normalization utility to convert backslashes to forward slashes in all relative path comparisons. `os.homedir()` already returns correct platform-native paths. `.gitattributes` already forces LF. |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `path` module | built-in | Cross-platform path manipulation | `path.join`, `path.relative`, `path.sep` handle OS-specific separators |
| Node.js `os` module | built-in | `os.homedir()` returns platform-correct home dir | Returns `/Users/x` on macOS, `/home/x` on Linux/WSL, `C:\Users\x` on native Windows |
| simple-git | ^3.32.3 | `git.clone(repoPath, localPath)` for bootstrap | Already a dependency. Clone API: `clone(repoPath: string, localPath: string, options?: TaskOptions): Response<string>` |

### Supporting (already installed -- no new dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | ^1.1.1 | Colored CLI output | Bootstrap command success/error messages |
| commander | ^14.0.2 | CLI framework | Register `bootstrap` subcommand |

### No New Dependencies Needed
This phase requires **zero new npm packages**. All cross-platform path handling is done with Node.js built-in `path` and `os` modules. The bootstrap command uses `simple-git` clone which is already installed.

## Architecture Patterns

### Path Normalization Utility

**What:** A `normalizePath(relativePath: string): string` function that converts backslashes to forward slashes.
**When to use:** Every time a relative path is computed from `path.relative()` or `path.join()` before it enters the manifest/scanner/sync-engine comparison pipeline.
**Why:** On Windows, `path.relative()` returns `agents\default.md` but the manifest expects `agents/`. Forward-slash normalization is safe on all platforms (Node.js accepts forward slashes on Windows).

```typescript
// src/platform/paths.ts (add to existing file)

/**
 * Normalizes a relative path to use forward slashes (POSIX-style).
 * On macOS/Linux this is a no-op. On Windows it converts backslashes.
 * Used to ensure consistent path comparison against the manifest allowlist.
 */
export function normalizePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
```

### Bootstrap Command Pattern

**What:** A `claude-sync bootstrap <repo-url>` command that sets up a new machine from an existing remote.
**When to use:** First-time setup on a new machine that has no existing `~/.claude-sync` repo.
**Pattern:** Clone remote -> apply files to `~/.claude` -> report success.

The bootstrap flow:
1. Validate: `~/.claude-sync` must not already exist (or use `--force`)
2. Clone: `simpleGit().clone(repoUrl, syncRepoDir)`
3. Ensure `~/.claude` exists (create if needed -- new machine may not have it)
4. Apply: reuse the file-copy logic from `syncPull` (scan repo, copy to claudeDir with path expansion)
5. Report: show count of files applied, any warnings

```typescript
// src/cli/commands/bootstrap.ts -- follows handleX/registerXCommand pattern

export interface BootstrapOptions {
  repoUrl: string;
  repoPath?: string;
  claudeDir?: string;
  force?: boolean;
}

export interface BootstrapResult {
  syncRepoDir: string;
  claudeDir: string;
  filesApplied: number;
  message: string;
}
```

### Recommended File Structure Changes
```
src/
  platform/
    paths.ts          # ADD: normalizePath() utility
  core/
    scanner.ts        # MODIFY: normalize relative paths before isPathAllowed
    sync-engine.ts    # MODIFY: normalize relative paths in comparisons
  cli/
    commands/
      bootstrap.ts    # NEW: bootstrap command handler
    index.ts          # MODIFY: register bootstrap command
tests/
  platform/
    paths.test.ts     # NEW: tests for normalizePath
  commands/
    bootstrap.test.ts # NEW: integration tests for bootstrap
  core/
    scanner.test.ts   # ADD: cross-platform path tests
```

### Anti-Patterns to Avoid
- **Hardcoding path separators:** Never compare paths using string literals with `/` or `\`. Always use `normalizePath()` or `path` module methods.
- **Using `path.join()` to build manifest patterns:** The manifest patterns use POSIX-style forward slashes intentionally. Do not "fix" them to use `path.sep`.
- **Duplicating apply logic:** The bootstrap command must reuse the same file-copy-with-expansion logic as `syncPull`, not duplicate it. Extract a shared `applyRepoToLocal` function if needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path separator normalization | Regex replace `\\` everywhere | Single `normalizePath()` utility called at path-entry points | Centralizes the fix, easy to audit, no missed spots |
| Git clone | Shell exec `git clone` | `simpleGit().clone(url, path)` | Already a dependency, typed return, error handling built in |
| Home directory detection | `process.env.HOME` fallback chains | `os.homedir()` | Handles all platforms including edge cases (no HOME set on Windows) |
| Line ending normalization | Manual `\r\n` -> `\n` conversion | `.gitattributes` (already committed as first artifact) | Git handles normalization at checkout/commit boundaries |

**Key insight:** The existing codebase already handles the hard problems (path token rewriting, allowlist filtering, line endings via .gitattributes). Phase 3 is about fixing the path separator gap and adding the bootstrap command.

## Common Pitfalls

### Pitfall 1: Scanner Returns Empty Results on Windows
**What goes wrong:** `path.relative()` returns backslash-separated paths on Windows. `isPathAllowed("agents\\default.md")` checks `"agents\\default.md".startsWith("agents/")` which returns `false`. The scanner returns zero files on Windows.
**Why it happens:** The manifest patterns use forward slashes (POSIX convention), but `path.relative()` is platform-dependent.
**How to avoid:** Normalize relative paths to forward slashes immediately after `path.relative()` in the scanner, before calling `isPathAllowed()`.
**Warning signs:** Tests pass on macOS/Linux but scanner returns empty results on Windows. Zero files synced on Windows.

### Pitfall 2: Bootstrap Into Existing State Without Warning
**What goes wrong:** User runs `bootstrap` on a machine that already has `~/.claude` with local config. Bootstrap overwrites local files without warning or backup.
**Why it happens:** Bootstrap assumes a clean machine. But users may have partial config from Claude Code's own initialization.
**How to avoid:** Check if `~/.claude` has existing config files. If so, create a backup (reuse `createBackup`) before overwriting. Print a warning.
**Warning signs:** User loses local settings after bootstrap.

### Pitfall 3: Path Tokens Contain Platform-Specific Separators
**What goes wrong:** On Windows, `os.homedir()` returns `C:\Users\name`. The path rewriter stores `C:\Users\name` and replaces it with `{{HOME}}`. On Linux, `{{HOME}}` expands to `/home/name` but the surrounding path structure may still have Windows separators from the original content.
**Why it happens:** `replaceAll(homeDir, "{{HOME}}")` only replaces the home directory prefix. If the settings.json content has paths like `C:\Users\name\.claude\hooks\script.js`, the `.claude\hooks\script.js` portion retains backslashes after replacement, producing `{{HOME}}\.claude\hooks\script.js`. On Linux, this expands to `/home/bob\.claude\hooks\script.js` which is wrong.
**How to avoid:** When rewriting paths for repo, also normalize path separators within the path to forward slashes. The expansion on Linux naturally produces forward-slash paths. On WSL, Claude Code runs as a Linux process expecting POSIX paths, so forward slashes are correct.
**Warning signs:** Hook commands fail on the target platform after bootstrap. Settings.json has mixed separators.

### Pitfall 4: Bootstrap Clone Fails Without Useful Error
**What goes wrong:** `git clone` fails (auth, network, bad URL) and simple-git throws a generic error. User sees a raw git error message.
**Why it happens:** The error from git is passed through without human-friendly wrapping.
**How to avoid:** Catch clone errors specifically and wrap with actionable messages: "Clone failed: check your repository URL and authentication. For SSH repos, ensure your SSH key is loaded." Follow the same try/catch pattern as init.ts.
**Warning signs:** User reports cryptic error messages during bootstrap.

### Pitfall 5: Relative Path Comparison Fails in Sync Status on Windows
**What goes wrong:** `syncStatus` compares relative paths from two `scanDirectory` calls using Set equality. If one directory returns `agents\default.md` and another returns `agents/default.md`, the comparison fails even though they refer to the same file.
**Why it happens:** Both calls use `path.relative()` which is platform-consistent within a single run, but the issue arises if the sync repo was populated on a different platform.
**How to avoid:** Normalize all relative paths to forward slashes consistently in both scanner output and sync-engine comparisons.
**Warning signs:** Status shows all files as "added" and "deleted" simultaneously.

## Code Examples

### Normalizing Relative Paths (the core fix)

```typescript
// Source: Node.js path documentation + project analysis

import * as path from "node:path";

/**
 * Normalizes a relative path to use forward slashes.
 * Critical for cross-platform manifest matching.
 */
export function normalizePath(relativePath: string): string {
  // On macOS/Linux, path.sep is '/' so this is a no-op
  // On Windows, path.sep is '\\' so this converts to '/'
  return relativePath.split(path.sep).join("/");
}
```

### Scanner Fix (minimal change)

```typescript
// src/core/scanner.ts -- change on line 33

// BEFORE (breaks on Windows):
const relativePath = path.relative(sourceDir, path.join(entry.parentPath, entry.name));

// AFTER (works everywhere):
import { normalizePath } from "../platform/paths.js";
const relativePath = normalizePath(
  path.relative(sourceDir, path.join(entry.parentPath, entry.name))
);
```

### Bootstrap Command (follows existing handleX pattern)

```typescript
// src/cli/commands/bootstrap.ts

import { simpleGit } from "simple-git";
import { getClaudeDir, getSyncRepoDir } from "../../platform/paths.js";
import { isGitRepo } from "../../git/repo.js";
import { scanDirectory } from "../../core/scanner.js";
import { expandPathsForLocal } from "../../core/path-rewriter.js";
import { createBackup } from "../../core/backup.js";

export async function handleBootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  const syncRepoDir = options.repoPath ?? getSyncRepoDir();
  const claudeDir = options.claudeDir ?? getClaudeDir();
  const homeDir = path.dirname(claudeDir);

  // Guard: sync repo must not already exist (unless --force)
  if (await isGitRepo(syncRepoDir)) {
    if (!options.force) {
      throw new Error(
        `Sync repo already exists at ${syncRepoDir}. Use --force to re-clone.`
      );
    }
    await fs.rm(syncRepoDir, { recursive: true, force: true });
  }

  // Clone the remote repo
  await simpleGit().clone(options.repoUrl, syncRepoDir);

  // Create ~/.claude if it doesn't exist (new machine)
  await fs.mkdir(claudeDir, { recursive: true });

  // Backup existing config if any files exist
  // (reuse createBackup -- it handles empty dirs gracefully)
  let backupDir: string | null = null;
  try {
    const existingFiles = await scanDirectory(claudeDir);
    if (existingFiles.length > 0) {
      const backupBaseDir = path.join(path.dirname(syncRepoDir), ".claude-sync-backups");
      backupDir = await createBackup(claudeDir, backupBaseDir);
    }
  } catch {
    // No existing files -- that's expected on a new machine
  }

  // Apply repo files to claudeDir (same logic as syncPull)
  const repoFiles = await scanDirectory(syncRepoDir);
  for (const relativePath of repoFiles) {
    const srcPath = path.join(syncRepoDir, relativePath);
    const destPath = path.join(claudeDir, relativePath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    let content = await fs.readFile(srcPath, "utf-8");
    if (path.basename(relativePath) === "settings.json") {
      content = expandPathsForLocal(content, homeDir);
    }
    await fs.writeFile(destPath, content);
  }

  return {
    syncRepoDir,
    claudeDir,
    filesApplied: repoFiles.length,
    message: `Bootstrapped ${repoFiles.length} files from ${options.repoUrl}`,
  };
}
```

### Simple-Git Clone API (from type definitions)

```typescript
// Source: node_modules/simple-git/dist/typings/simple-git.d.ts

// Overload 1: with explicit local path
clone(
  repoPath: string,
  localPath: string,
  options?: TaskOptions,
  callback?: SimpleGitTaskCallback<string>
): Response<string>;

// Overload 2: clone to current directory
clone(
  repoPath: string,
  options?: TaskOptions,
  callback?: SimpleGitTaskCallback<string>
): Response<string>;
```

### Cross-Platform Path Rewriting Enhancement

```typescript
// Enhanced rewritePathsForRepo that normalizes separators
// Source: project analysis of existing path-rewriter.ts

export function rewritePathsForRepo(content: string, homeDir: string): string {
  // Replace home dir with token
  let result = content.replaceAll(homeDir, "{{HOME}}");
  // On Windows, homeDir uses backslashes. Also replace forward-slash version
  // in case the content has mixed separators
  if (path.sep === "\\") {
    const forwardSlashHome = homeDir.split("\\").join("/");
    result = result.replaceAll(forwardSlashHome, "{{HOME}}");
  }
  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcode `/` in path comparisons | Use `normalizePath()` utility | Node.js has always had this issue | Prevents silent failure on Windows |
| `os.homedir()` only | `os.homedir()` (unchanged) | Stable since Node 4 | Returns correct platform-native path on all OSes including WSL |
| Manual CRLF handling | `.gitattributes text=auto eol=lf` | Git 2.10+ | Already implemented in Phase 1 -- handles line endings at git boundary |

**Key platform behaviors (verified):**
- **macOS:** `os.homedir()` -> `/Users/username`, `path.sep` -> `/`
- **Linux:** `os.homedir()` -> `/home/username`, `path.sep` -> `/`
- **WSL:** `os.homedir()` -> `/home/username`, `path.sep` -> `/` (it's a Linux environment)
- **Native Windows:** `os.homedir()` -> `C:\Users\username`, `path.sep` -> `\`

WSL is effectively Linux from Node.js perspective. The tool targets "Windows/WSL" per the requirements, which means Claude Code running inside WSL (Linux), not native Windows. This simplifies the scope significantly -- the primary risk is if someone runs the tool from native Windows Node.js, which is an edge case since Claude Code itself runs in WSL on Windows.

## Open Questions

1. **Should bootstrap run `npm install` after applying files?**
   - What we know: `~/.claude/package.json` is synced. The target machine may not have the npm dependencies installed.
   - What's unclear: Whether Claude Code itself handles `npm install` in `~/.claude`, or if the user/tool must do it.
   - Recommendation: After applying files, check if `package.json` exists in claudeDir. If so, print a message: "Run 'npm install' in ~/.claude if plugins require it." Do NOT auto-run npm install -- it adds complexity and may fail without network.

2. **Should bootstrap set up a remote tracking branch?**
   - What we know: `git clone` automatically sets up `origin` remote and tracking. This is handled by git, not our code.
   - What's unclear: Nothing -- this is a non-issue. Clone handles it.
   - Recommendation: No action needed. Git clone configures origin and tracking automatically.

3. **Native Windows (non-WSL) support scope?**
   - What we know: The requirements say "Windows/WSL". Claude Code on Windows runs inside WSL. WSL is a Linux environment where `path.sep` is `/` and `os.homedir()` returns `/home/user`.
   - What's unclear: Whether anyone would run claude-sync from native Windows PowerShell/cmd.
   - Recommendation: The normalizePath fix costs nothing and makes native Windows work too. Include it. But testing can focus on macOS/Linux/WSL.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETUP-01-a | Bootstrap clones remote to sync repo dir | integration | `npx vitest run tests/commands/bootstrap.test.ts -t "clones remote" -x` | No -- Wave 0 |
| SETUP-01-b | Bootstrap applies repo files to ~/.claude with path expansion | integration | `npx vitest run tests/commands/bootstrap.test.ts -t "applies files" -x` | No -- Wave 0 |
| SETUP-01-c | Bootstrap creates backup if ~/.claude has existing files | integration | `npx vitest run tests/commands/bootstrap.test.ts -t "backup" -x` | No -- Wave 0 |
| SETUP-01-d | Bootstrap errors if sync repo already exists (without --force) | integration | `npx vitest run tests/commands/bootstrap.test.ts -t "already exists" -x` | No -- Wave 0 |
| SETUP-01-e | Bootstrap --force re-clones | integration | `npx vitest run tests/commands/bootstrap.test.ts -t "force" -x` | No -- Wave 0 |
| SETUP-02-a | normalizePath converts backslashes to forward slashes | unit | `npx vitest run tests/platform/paths.test.ts -t "normalizePath" -x` | No -- Wave 0 |
| SETUP-02-b | Scanner returns correct files with Windows-style paths | unit | `npx vitest run tests/core/scanner.test.ts -t "cross-platform" -x` | No -- Wave 0 |
| SETUP-02-c | Path rewriter handles Windows home dir separators | unit | `npx vitest run tests/core/path-rewriter.test.ts -t "Windows" -x` | No -- Wave 0 |
| SETUP-02-d | Sync status comparison works with normalized paths | unit | `npx vitest run tests/core/sync-engine.test.ts -t "normalized" -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/platform/paths.test.ts` -- covers SETUP-02-a (normalizePath unit tests)
- [ ] `tests/commands/bootstrap.test.ts` -- covers SETUP-01 (bootstrap integration tests)
- [ ] Additional test cases in existing `tests/core/scanner.test.ts` for cross-platform paths
- [ ] Additional test cases in existing `tests/core/path-rewriter.test.ts` for Windows separators

## Sources

### Primary (HIGH confidence)
- [Node.js Path documentation](https://nodejs.org/api/path.html) -- `path.sep`, `path.relative()`, `path.join()` platform behavior
- [Node.js OS documentation](https://nodejs.org/api/os.html) -- `os.homedir()` returns USERPROFILE on Windows, $HOME on POSIX
- simple-git type definitions (local: `node_modules/simple-git/dist/typings/simple-git.d.ts`) -- clone API signature verified
- Direct codebase inspection of scanner.ts, manifest.ts, sync-engine.ts, path-rewriter.ts -- confirmed path separator bug

### Secondary (MEDIUM confidence)
- [Tips for Writing Portable Node.js Code](https://gist.github.com/domenic/2790533) -- cross-platform path best practices
- [Cross-platform Node.js by Alan Norbauer](https://alan.norbauer.com/articles/cross-platform-nodejs/) -- path normalization patterns
- [GeeksforGeeks os.homedir()](https://www.geeksforgeeks.org/node-js/node-js-os-homedir-method/) -- confirmed USERPROFILE vs HOME behavior
- [Writing cross-platform Node.js by George Ornbo](https://shapeshed.com/writing-cross-platform-node/) -- path.sep usage patterns
- [Claude Code WSL issues](https://github.com/anthropics/claude-code/issues/16165) -- confirms ~/.claude in WSL Linux home

### Tertiary (LOW confidence)
- Native Windows (non-WSL) Claude Code behavior -- inferred that Claude Code requires WSL on Windows, but not directly confirmed from official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing libraries verified
- Architecture: HIGH -- normalizePath pattern is well-established, bootstrap follows existing command patterns
- Pitfalls: HIGH -- path separator bug confirmed through direct code inspection of scanner.ts + manifest.ts interaction
- Bootstrap command: HIGH -- simple-git clone API verified from local type definitions

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- Node.js path module and simple-git are mature)
