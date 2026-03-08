# Phase 1: Foundation - Research

**Researched:** 2026-03-08
**Domain:** TypeScript CLI scaffolding, Git repo initialization, file manifest/allowlist, path token rewriting
**Confidence:** HIGH

## Summary

Phase 1 delivers the project scaffolding (package.json, TypeScript, build tooling, test framework) and the `claude-sync init` command. This command creates a git-backed sync repository from an existing `~/.claude` directory, selecting only user-authored config files via an opinionated allowlist manifest, rewriting absolute paths in `settings.json` to portable `{{HOME}}` tokens, and committing a `.gitattributes` file enforcing LF line endings as the first artifact.

The project currently has zero source code -- no package.json, no TypeScript files, no test infrastructure. Everything must be scaffolded from scratch. The stack decisions are already locked by project-level research: Node.js 22 LTS, TypeScript 5.9, Commander.js 14, simple-git 3.32, vitest 4, tsup 8, Biome 2, zod 4, and picocolors. The architecture follows a source-of-truth + apply pattern with a separate sync repository directory, using file copying (not symlinks).

The three critical design decisions for Phase 1 are: (1) the allowlist manifest defining exactly which paths sync, (2) the path rewriting logic that replaces `$HOME/.claude/` prefixes with `{{HOME}}/.claude/` tokens in settings.json on commit and expands them on apply, and (3) the `.gitattributes` content enforcing LF line endings. All three are well-understood with verified patterns from the research phase.

**Primary recommendation:** Scaffold the full project structure in one task, then implement the `init` command as a pipeline: create sync repo dir, write .gitattributes, scan ~/.claude with allowlist, copy matching files, rewrite paths in settings.json, git init + add + commit.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | User can initialize a git repo from existing ~/.claude config with one command | simple-git API supports `init()`, `add()`, `commit()` chaining. Commander.js provides the CLI framework. The init flow is: create sync dir, git init, copy allowlisted files, commit. |
| SYNC-02 | Tool ships with Claude-aware default manifest (allowlist of ~8 sync targets, excludes ~18 ephemeral items) | Actual ~/.claude directory examined: 8 sync targets identified (settings.json, CLAUDE.md, agents/, commands/, hooks/, get-shit-done/, package.json, gsd-file-manifest.json), 16+ ephemeral items cataloged with sizes. |
| SAFE-02 | Tool rewrites absolute paths in settings.json to portable tokens, expands on apply | settings.json contains 3 absolute paths, all following `/Users/<username>/.claude/...` pattern. Token format `{{HOME}}` with simple string replacement is sufficient. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | >=22.0.0 LTS | Runtime | Already required by Claude Code; maintenance LTS until April 2027 |
| TypeScript | ~5.9.3 | Type safety | Current stable; strong typing for config schemas and git wrappers |
| Commander.js | ^14.0.2 | CLI framework | Lightweight, excellent TS types, CJS+ESM dual support. v15 ESM-only ships May 2026 -- premature |
| simple-git | ^3.32.3 | Git operations | 6M+ weekly downloads, promise-based API wrapping native git, bundled TS types |
| zod | ^4.3.6 | Config validation | TypeScript-first schema validation, 96M+ weekly downloads |
| picocolors | ^1.1.1 | Terminal coloring | 14x smaller than chalk, zero dependencies, sufficient for status output |

### Development

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tsup | ^8.5.0 | Bundler | Bundles to CJS+ESM, zero config for simple cases. Stable, battle-tested |
| vitest | ^4.0.18 | Test runner | Native TS support, fast, excellent watch mode. Standard for new TS projects |
| Biome | ^2.x | Linter + formatter | Replaces ESLint + Prettier, 10-25x faster, single config file |
| memfs | latest | FS mocking for tests | Vitest-recommended approach for filesystem testing |

### Not needed in Phase 1 (but in stack for later phases)

| Library | Phase | Reason to defer |
|---------|-------|-----------------|
| chokidar ^4.0.3 | Phase 3 (auto-sync) | File watching not needed until background daemon |
| ora ^9.3.0 | Phase 2 (sync ops) | Spinners for long git operations; init is fast |
| conf ^13.0.0 | Phase 2 (sync ops) | Tool config storage for remote URL, sync state |

**Installation (Phase 1 only):**
```bash
# Core
npm install commander simple-git zod picocolors

# Dev
npm install -D typescript tsup vitest @biomejs/biome @types/node memfs
```

## Architecture Patterns

### Project Structure for Phase 1

```
claude-sync/
├── src/
│   ├── cli/
│   │   ├── index.ts           # Main CLI entry point (Commander setup, bin shebang)
│   │   └── commands/
│   │       └── init.ts        # `claude-sync init` command handler
│   ├── core/
│   │   ├── manifest.ts        # Allowlist definition and file matching logic
│   │   ├── scanner.ts         # Walk ~/.claude, apply manifest, return file list
│   │   └── path-rewriter.ts   # {{HOME}} token rewriting for settings.json
│   ├── git/
│   │   └── repo.ts            # Git operations: init, add, commit (wraps simple-git)
│   ├── platform/
│   │   └── paths.ts           # Home directory detection, sync repo location
│   └── index.ts               # Library entry point (re-exports)
├── tests/
│   ├── core/
│   │   ├── manifest.test.ts
│   │   ├── scanner.test.ts
│   │   └── path-rewriter.test.ts
│   ├── git/
│   │   └── repo.test.ts
│   └── __mocks__/
│       ├── fs.cjs             # memfs mock for vitest
│       └── fs/
│           └── promises.cjs   # memfs promises mock
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── biome.json
└── .gitignore
```

### Pattern 1: Allowlist-Based File Selection (NOT Blocklist)

**What:** The manifest defines an explicit list of paths/patterns to INCLUDE in sync. Everything not on the list is excluded by default.

**When to use:** Always. This is the foundational safety pattern. New directories added by Claude Code updates are automatically excluded.

**Why not blocklist:** The ~/.claude directory contains 1.6+ GB of ephemeral data across 16+ directories. A blocklist requires knowing about every new directory Claude Code creates. A missed entry means accidentally syncing hundreds of MB of machine-local state into git -- irreversible once committed.

**Implementation:**
```typescript
// src/core/manifest.ts
export const DEFAULT_SYNC_TARGETS: readonly string[] = [
  'settings.json',
  'CLAUDE.md',
  'agents/',
  'commands/',
  'hooks/',
  'get-shit-done/',
  'package.json',
  'gsd-file-manifest.json',
] as const;

// Plugins need selective sync -- config yes, caches no
export const PLUGIN_SYNC_PATTERNS: readonly string[] = [
  'plugins/blocklist.json',
  'plugins/known_marketplaces.json',
  'plugins/marketplaces/',
] as const;

export const PLUGIN_IGNORE_PATTERNS: readonly string[] = [
  'plugins/install-counts-cache.json',
] as const;
```

### Pattern 2: Path Token Rewriting

**What:** Replace the user's home directory prefix in settings.json with `{{HOME}}` when copying to the sync repo. Expand `{{HOME}}` back to the local home directory when applying from the repo.

**When to use:** When copying settings.json to/from the sync repo. Only settings.json needs this -- other config files don't contain absolute paths.

**Implementation:**
```typescript
// src/core/path-rewriter.ts
const TOKEN = '{{HOME}}';

export function rewritePathsForRepo(content: string, homeDir: string): string {
  // Escape special regex characters in homeDir
  const escaped = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Replace all occurrences of the home directory with the token
  return content.replaceAll(homeDir, TOKEN);
}

export function expandPathsForLocal(content: string, homeDir: string): string {
  return content.replaceAll(TOKEN, homeDir);
}
```

**Verified path patterns in actual settings.json:**
- `"/Users/wohlgemuth/.claude/hooks/gsd-check-update.js"` -- SessionStart hook
- `"/Users/wohlgemuth/.claude/hooks/gsd-context-monitor.js"` -- PostToolUse hook
- `"/Users/wohlgemuth/.claude/hooks/gsd-statusline.js"` -- statusLine command

All 3 paths follow the pattern `<HOME_DIR>/.claude/...`. Simple string replacement of `os.homedir()` with `{{HOME}}` handles all cases.

### Pattern 3: .gitattributes as First Commit

**What:** The very first file committed to the sync repo is `.gitattributes` enforcing LF line endings. This ensures all subsequent commits normalize line endings correctly.

**Implementation:**
```
# .gitattributes content
* text=auto eol=lf
*.json text eol=lf
*.md text eol=lf
*.js text eol=lf
*.sh text eol=lf
```

### Pattern 4: Init Command Flow

**What:** The `claude-sync init` command orchestrates the entire first-time setup.

**Flow:**
```
1. Detect home directory (os.homedir())
2. Determine sync repo path (~/.claude-sync/ or configurable)
3. Check if sync repo already exists (idempotency guard)
4. Create sync repo directory
5. git init in sync repo
6. Write .gitattributes -> git add -> git commit "chore: initialize sync repo with line ending config"
7. Scan ~/.claude with allowlist manifest
8. For each matching file/directory:
   a. Copy to sync repo (preserving directory structure)
   b. If file is settings.json: rewrite paths with {{HOME}} token
9. git add all copied files
10. git commit "feat: initial sync of claude config"
11. Report: what was synced, what was excluded, total size
```

### Anti-Patterns to Avoid

- **Blocklist approach:** Never define what to exclude. Always define what to include. New unknown directories default to excluded.
- **Symlinks:** Never symlink files. Always copy. Symlinks break on WSL and create confusing behavior when the sync repo is modified.
- **`git add -A` or `git add .`:** Never use blanket add. Always specify exact file paths to avoid accidentally committing files outside the manifest.
- **Modifying files in ~/.claude directly:** The sync repo is the "staging area." Copy in, transform (path rewriting), commit. Never modify the user's live config during the init process.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git operations | Raw `child_process.exec('git ...')` | simple-git | Typed API, error handling, promise-based, handles edge cases (paths with spaces, large output) |
| CLI argument parsing | Manual process.argv parsing | Commander.js | Subcommands, help generation, option validation, TypeScript types |
| JSON schema validation | Manual typeof/hasOwnProperty checks | zod | Type inference, detailed error messages, composable schemas |
| Directory traversal with filtering | Recursive readdir + manual filter | `fs.readdir` with the manifest allowlist | The allowlist is small (~10 entries); no need for a glob library. Simple `fs.stat` + path matching suffices |
| Path normalization across platforms | Manual string manipulation | `path.posix.join()` + `os.homedir()` | Node.js stdlib handles platform differences correctly |
| TypeScript bundling | tsc alone | tsup | Handles CJS+ESM dual output, shebang injection for CLI bins, tree-shaking |
| File copying with directory creation | Manual recursive mkdir + writeFile | `fs.cp` (Node 22) with `recursive: true` | Built into Node 22 LTS, handles nested directory creation |

**Key insight:** Phase 1 has zero novel technical challenges. Every operation (git init, file copy, string replace, CLI parsing) has a mature, well-typed library solution. The complexity is in the correct composition of these operations, not in any individual operation.

## Common Pitfalls

### Pitfall 1: Syncing Machine-Local Ephemeral Data

**What goes wrong:** Including directories like `projects/` (964 MB), `debug/` (380 MB), or `telemetry/` (134 MB) in the sync repo. Once committed to git, large files are in history forever.
**Why it happens:** Treating ~/.claude as a monolithic directory instead of identifying the ~2 MB of actual config within 1.6+ GB of ephemeral state.
**How to avoid:** Allowlist-only manifest. The default manifest includes exactly 8 targets (+ selective plugin paths). Everything else is excluded.
**Warning signs:** Sync repo `.git` directory exceeds 5 MB. `git status` shows hundreds of files after a Claude Code session.

### Pitfall 2: Hardcoded Absolute Paths Breaking Cross-Machine Sync

**What goes wrong:** `settings.json` contains `/Users/wohlgemuth/.claude/hooks/...` which fails on any machine with a different username or OS.
**Why it happens:** Claude Code writes absolute paths because it runs on one machine.
**How to avoid:** Path rewriter transforms `$HOME` prefix to `{{HOME}}` token on commit, expands on apply. Simple string replacement -- not regex-based pattern matching.
**Warning signs:** `grep -r "/Users/" <sync-repo>` or `grep -r "/home/" <sync-repo>` returns matches.

### Pitfall 3: Line Ending Corruption

**What goes wrong:** Hook scripts synced from Windows to Linux have CRLF endings, producing `\r: command not found` errors.
**Why it happens:** Git's `core.autocrlf` varies by platform and installation.
**How to avoid:** `.gitattributes` forcing `eol=lf` is the first file committed. Before any config files enter the repo.
**Warning signs:** `file <script>` shows "with CRLF line terminators" on Linux/macOS.

### Pitfall 4: Non-Idempotent Init

**What goes wrong:** Running `claude-sync init` twice crashes with "directory already exists" or "git repo already initialized."
**Why it happens:** Not checking preconditions before each operation.
**How to avoid:** Check if sync repo directory exists, check if it's already a git repo (`simple-git.checkIsRepo()`), check if initial commit already exists. Provide clear error message: "Sync repo already initialized at ~/.claude-sync. Use --force to re-initialize."
**Warning signs:** Users report needing to manually delete directories to retry failed init.

### Pitfall 5: The ~/.claude.json Trap

**What goes wrong:** Syncing `~/.claude.json` (the file OUTSIDE the ~/.claude directory) which mutates on every Claude Code startup (numStartups, tipsHistory, cachedStatsigGates, etc.).
**Why it happens:** Confusing `~/.claude.json` (runtime state) with `~/.claude/settings.json` (user config).
**How to avoid:** The manifest explicitly does NOT include `~/.claude.json`. Only files INSIDE `~/.claude/` are candidates for sync.
**Warning signs:** Git log shows commits every few minutes with counter changes.

### Pitfall 6: Plugin Directory Complexity

**What goes wrong:** Syncing all of `plugins/` includes `install-counts-cache.json` (15 KB, changes frequently) and marketplace clone data that may be large.
**Why it happens:** Treating plugins/ as a monolithic directory.
**How to avoid:** Selective plugin sync: include `blocklist.json`, `known_marketplaces.json`, and `marketplaces/` directories. Exclude `install-counts-cache.json`.
**Warning signs:** Frequent meaningless commits from cache file changes.

## Code Examples

### simple-git: Init, Add, Commit Chain

```typescript
// Source: simple-git npm docs + TypeScript definitions
import simpleGit, { type SimpleGit } from 'simple-git';

async function initSyncRepo(repoPath: string): Promise<void> {
  const git: SimpleGit = simpleGit(repoPath);

  // Initialize the repository
  await git.init();

  // Add and commit .gitattributes as first commit
  await git.add('.gitattributes');
  await git.commit('chore: initialize sync repo with line ending config');

  // After copying config files...
  await git.add(['settings.json', 'CLAUDE.md', 'agents/', 'commands/']);
  await git.commit('feat: initial sync of claude config');
}

// Check if directory is already a git repo
async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const git = simpleGit(dirPath);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}
```

### Commander.js: CLI Setup with Subcommands

```typescript
// Source: Commander.js docs + LogRocket tutorial
import { Command } from 'commander';

const program = new Command();

program
  .name('claude-sync')
  .description('Git-backed sync for ~/.claude')
  .version('0.1.0');

program
  .command('init')
  .description('Create sync repo from existing ~/.claude')
  .option('--force', 'Re-initialize even if sync repo exists')
  .option('--repo-path <path>', 'Custom sync repo location', '~/.claude-sync')
  .action(async (options) => {
    // Delegate to init handler
    await handleInit(options);
  });

program.parse();
```

### fs.cp: Recursive File Copy (Node 22)

```typescript
// Source: Node.js 22 LTS docs
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function copyToSyncRepo(
  sourceBase: string,   // ~/.claude
  targetBase: string,   // ~/.claude-sync
  relativePath: string  // e.g., 'agents/' or 'settings.json'
): Promise<void> {
  const src = join(sourceBase, relativePath);
  const dst = join(targetBase, relativePath);

  await cp(src, dst, { recursive: true });
}
```

### Zod: Config Schema Validation

```typescript
// Source: zod docs
import { z } from 'zod';

const SyncManifestSchema = z.object({
  syncTargets: z.array(z.string()),
  pluginSyncPatterns: z.array(z.string()).optional(),
  pluginIgnorePatterns: z.array(z.string()).optional(),
  pathRewriteFiles: z.array(z.string()).default(['settings.json']),
});

type SyncManifest = z.infer<typeof SyncManifestSchema>;
```

### tsup.config.ts: CLI Build Configuration

```typescript
// Source: tsup docs
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli/index.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node22',
  banner: {
    // Shebang for CLI entry point
    js: (ctx) => ctx.options.entry?.['cli']
      ? '#!/usr/bin/env node'
      : '',
  },
});
```

### vitest.config.ts: Test Configuration

```typescript
// Source: vitest docs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ESLint + Prettier (2 tools, 4+ configs) | Biome 2 (1 tool, 1 config) | 2024-2025 | Faster linting, simpler setup, fewer dependencies |
| Jest for TS testing | vitest 4 | 2023-2025 | Native TS, faster, better watch mode |
| ts-node for dev | tsup build + node for run | 2024+ | Faster startup, no runtime TS compilation |
| `fs.mkdir` + `fs.copyFile` recursive | `fs.cp` with `recursive: true` | Node 20+ | Single call copies directories recursively |
| zod v3 | zod v4 | 2025 | New API surface, better performance, same paradigm |
| Commander v12 | Commander v14 | 2024-2025 | CJS+ESM dual support; v15 ESM-only coming May 2026 |

**Deprecated/outdated:**
- `ts-node`: Unnecessary when building with tsup ahead of time
- `chalk v5+`: ESM-only, heavier than picocolors for basic coloring
- `jest`: Legacy for new TypeScript projects; vitest is the standard
- `fs.mkdirSync` + manual recursive copy: `fs.cp` handles this natively since Node 20

## Open Questions

1. **Sync repo default location**
   - What we know: Research suggests `~/.claude-sync/` or `~/.local/share/claude-sync/`
   - What's unclear: Whether XDG conventions should be followed on Linux (putting it in `~/.local/share/`)
   - Recommendation: Use `~/.claude-sync/` for simplicity and discoverability. It's adjacent to `~/.claude/` which makes the relationship obvious. Can be overridden with `--repo-path`.

2. **Should `plans/` be synced?**
   - What we know: The README excludes `plans/` from sync. The directory contains auto-generated planning files with random names (e.g., `cryptic-zooming-hopcroft.md`).
   - What's unclear: Whether these are user-authored or machine-generated.
   - Recommendation: Exclude. The filenames suggest auto-generation (Claude Code plan artifacts), and they are listed in the README's "excluded" section.

3. **Should `plugins/marketplaces/` contents be synced?**
   - What we know: `marketplaces/` contains cloned marketplace repos totaling ~13 MB (4 repos). They are git clones that could be re-fetched.
   - What's unclear: Whether re-cloning happens automatically or requires user action.
   - Recommendation: Include in manifest for now (they contain the actual skill definitions the user selected). If size becomes an issue, can be converted to a "re-fetch on apply" approach later.

4. **`gsd-file-manifest.json` sync decision**
   - What we know: The README includes it in "synced" list. It's 15 KB and tracks the GSD framework file hashes.
   - What's unclear: Whether it's needed for GSD to function on another machine or is regenerated.
   - Recommendation: Include per README. It's small and the README explicitly lists it.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18 |
| Config file | `vitest.config.ts` -- needs creation in Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | `init` creates a git repo at sync location from ~/.claude | integration | `npx vitest run tests/commands/init.test.ts -x` | Wave 0 |
| SYNC-02-a | Default manifest includes exactly the expected sync targets | unit | `npx vitest run tests/core/manifest.test.ts -x` | Wave 0 |
| SYNC-02-b | Scanner returns only files matching the manifest allowlist | unit | `npx vitest run tests/core/scanner.test.ts -x` | Wave 0 |
| SYNC-02-c | Ephemeral directories (projects/, debug/, telemetry/) are excluded | unit | `npx vitest run tests/core/scanner.test.ts -x` | Wave 0 |
| SAFE-02-a | Path rewriter replaces home dir with {{HOME}} token | unit | `npx vitest run tests/core/path-rewriter.test.ts -x` | Wave 0 |
| SAFE-02-b | Path expander replaces {{HOME}} token with local home dir | unit | `npx vitest run tests/core/path-rewriter.test.ts -x` | Wave 0 |
| SAFE-02-c | settings.json roundtrips through rewrite+expand without data loss | unit | `npx vitest run tests/core/path-rewriter.test.ts -x` | Wave 0 |
| CROSS-01 | .gitattributes with LF enforcement is first commit in sync repo | integration | `npx vitest run tests/git/repo.test.ts -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `package.json` -- project initialization with all dependencies
- [ ] `tsconfig.json` -- TypeScript configuration
- [ ] `vitest.config.ts` -- test framework configuration
- [ ] `biome.json` -- linter/formatter configuration
- [ ] `tsup.config.ts` -- build configuration
- [ ] `tests/__mocks__/fs.cjs` -- memfs mock for filesystem tests
- [ ] `tests/__mocks__/fs/promises.cjs` -- memfs promises mock
- [ ] `tests/core/manifest.test.ts` -- covers SYNC-02-a
- [ ] `tests/core/scanner.test.ts` -- covers SYNC-02-b, SYNC-02-c
- [ ] `tests/core/path-rewriter.test.ts` -- covers SAFE-02-a, SAFE-02-b, SAFE-02-c
- [ ] `tests/git/repo.test.ts` -- covers SYNC-01, CROSS-01
- [ ] `tests/commands/init.test.ts` -- covers SYNC-01 integration

## Sources

### Primary (HIGH confidence)
- [simple-git npm](https://www.npmjs.com/package/simple-git) -- v3.32.3 API, TypeScript definitions, init/add/commit signatures
- [simple-git TypeScript definitions](https://github.com/steveukx/git-js/blob/main/simple-git/typings/simple-git.d.ts) -- full type signatures for init, add, commit, status, checkIsRepo
- [Commander.js npm](https://www.npmjs.com/package/commander) -- v14.0.2, subcommand patterns, TypeScript setup
- [Commander.js GitHub](https://github.com/tj/commander.js) -- subcommand examples, action handlers
- [vitest file system mocking docs](https://vitest.dev/guide/mocking/file-system) -- memfs integration pattern
- [tsup docs](https://tsup.egoist.dev/) -- CLI bundling with shebang, dual format output
- [Git .gitattributes docs](https://git-scm.com/docs/gitattributes) -- eol=lf enforcement syntax
- Direct examination of `~/.claude/` directory (2026-03-08) -- actual structure, file sizes, settings.json path patterns

### Secondary (MEDIUM confidence)
- [LogRocket: Building TypeScript CLI with Commander](https://blog.logrocket.com/building-typescript-cli-node-js-commander/) -- Commander.js + TypeScript patterns
- [LogRocket: Using tsup to bundle TypeScript](https://blog.logrocket.com/tsup/) -- tsup configuration patterns
- [vitest configuration docs](https://vitest.dev/config/) -- vitest.config.ts setup

### Tertiary (LOW confidence)
- None -- all Phase 1 patterns are well-documented and verified against official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified on npm with current versions, all recommended by project-level research
- Architecture: HIGH -- source-of-truth + apply pattern is battle-tested by chezmoi; project structure follows established Node.js CLI conventions
- Pitfalls: HIGH -- derived from actual examination of ~/.claude directory with real file sizes and real settings.json content
- Code examples: HIGH -- derived from official docs and TypeScript type definitions

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable domain, mature libraries)
