---
phase: 01-foundation
plan: 01
subsystem: core
tags: [typescript, vitest, tsup, biome, allowlist, scanner, path-rewriter]

# Dependency graph
requires: []
provides:
  - "Allowlist manifest with 8 sync targets and 3 plugin patterns"
  - "Directory scanner that filters files through the manifest"
  - "Bidirectional {{HOME}} path token replacement for settings.json portability"
  - "Platform path resolution (home dir, .claude dir, sync repo dir)"
  - "Buildable TypeScript project with test infrastructure"
affects: [01-02, 02-01]

# Tech tracking
tech-stack:
  added: [typescript, tsup, vitest, biome, commander, simple-git, zod, picocolors]
  patterns: [esm-only, node16-module-resolution, tab-indent, allowlist-filtering, token-replacement]

key-files:
  created:
    - package.json
    - tsconfig.json
    - tsup.config.ts
    - vitest.config.ts
    - biome.json
    - .gitignore
    - src/core/manifest.ts
    - src/core/scanner.ts
    - src/core/path-rewriter.ts
    - src/platform/paths.ts
    - src/index.ts
    - src/cli/index.ts
    - tests/core/manifest.test.ts
    - tests/core/scanner.test.ts
    - tests/core/path-rewriter.test.ts
  modified: []

key-decisions:
  - "Used real temp directories (fs.mkdtemp) for scanner tests instead of mocking fs"
  - "Allowlist uses startsWith for directory targets (ending with /) and exact match for files"
  - "Path rewriter uses simple string replaceAll -- no regex needed since home dir paths are literal"

patterns-established:
  - "Allowlist-first filtering: only known paths are synced, unknowns are rejected"
  - "Token replacement pattern: {{HOME}} token for portable settings.json"
  - "Test structure mirrors src: tests/core/module.test.ts for src/core/module.ts"
  - "TDD workflow: failing tests committed first, then implementation"

requirements-completed: [SYNC-02, SAFE-02]

# Metrics
duration: 3min
completed: 2026-03-08
---

# Phase 1 Plan 01: Scaffold and Core Modules Summary

**Allowlist manifest with 8 sync targets, recursive directory scanner, and bidirectional {{HOME}} path rewriter for portable settings.json**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T19:41:15Z
- **Completed:** 2026-03-08T19:44:15Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Scaffolded full TypeScript project with build (tsup), test (vitest), lint (biome), and typecheck tooling
- Implemented allowlist manifest defining exactly 8 sync targets and 3 plugin-specific patterns with ignore list
- Implemented recursive directory scanner that filters through the manifest allowlist
- Implemented bidirectional {{HOME}} token replacement for settings.json portability
- All 28 tests pass across 3 test files (TDD: RED then GREEN)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold project structure and install dependencies** - `3ac7576` (feat)
2. **Task 2 RED: Failing tests for core modules** - `857c654` (test)
3. **Task 2 GREEN: Implement core modules** - `0d044ee` (feat)

_Note: Task 2 followed TDD with separate test and implementation commits._

## Files Created/Modified
- `package.json` - Project config with all dependencies
- `tsconfig.json` - TypeScript strict mode, ES2022, Node16 module resolution
- `tsup.config.ts` - Dual entry points (CLI + library), ESM, node22 target
- `vitest.config.ts` - Test runner config with v8 coverage
- `biome.json` - Formatter (tab indent, 100 line width) and linter
- `.gitignore` - Standard Node.js ignores
- `src/core/manifest.ts` - Allowlist: DEFAULT_SYNC_TARGETS, PLUGIN_SYNC_PATTERNS, PLUGIN_IGNORE_PATTERNS, isPathAllowed()
- `src/core/scanner.ts` - scanDirectory(): recursive scan filtered through allowlist
- `src/core/path-rewriter.ts` - rewritePathsForRepo() and expandPathsForLocal() for {{HOME}} token
- `src/platform/paths.ts` - getHomeDir(), getClaudeDir(), getSyncRepoDir()
- `src/index.ts` - Library entry re-exporting all modules
- `src/cli/index.ts` - Placeholder CLI entry point
- `tests/core/manifest.test.ts` - 15 test cases for allowlist behavior
- `tests/core/scanner.test.ts` - 6 test cases using real temp directories
- `tests/core/path-rewriter.test.ts` - 7 test cases including roundtrip

## Decisions Made
- Used real temp directories (fs.mkdtemp) for scanner tests instead of mocking fs -- more reliable and realistic
- Allowlist uses startsWith for directory targets (ending with /) and exact match for files -- simple and predictable
- Path rewriter uses simple string replaceAll rather than regex -- home dir paths are literal strings, no regex needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All core modules tested and ready for the init command (Plan 01-02)
- manifest.ts provides isPathAllowed() for the init command's file selection
- scanner.ts provides scanDirectory() for discovering files to sync
- path-rewriter.ts provides rewrite/expand for settings.json portability
- platform/paths.ts provides path resolution for ~/.claude and sync repo

## Self-Check: PASSED

- All 15 created files verified present on disk
- All 3 commit hashes verified in git log (3ac7576, 857c654, 0d044ee)
- 28/28 tests passing
- TypeScript compiles with zero errors

---
*Phase: 01-foundation*
*Completed: 2026-03-08*
