# claude-sync

Git-backed sync for `~/.claude` across macOS, Linux, and Windows/WSL.

Keeps your skills, commands, hooks, settings, and CLAUDE.md identical on every machine — no manual copying.

## Why

`~/.claude` is 1.6GB but only ~15MB is your actual config. Generic dotfile managers (chezmoi, yadm) don't know which files matter. claude-sync ships with an opinionated allowlist, rewrites hardcoded paths for cross-platform portability, and backs up your config before every pull.

## Install

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/berlinguyinca/claude-sync/main/install.sh | bash
```

The installer will:
1. Clone, build, and link the `claude-sync` binary
2. Ask for a GitHub repo name (default: `claude-config`) and visibility
3. Create the repo via `gh`, run `claude-sync init`, and push your config

Run it again to update an existing installation.

Requires: Node.js 22+, git, [GitHub CLI](https://cli.github.com/) (`gh`) for automatic repo creation

### Manual

```bash
git clone https://github.com/berlinguyinca/claude-sync.git
cd claude-sync
npm install
npm run build
npm link

claude-sync init
cd ~/.claude-sync && git remote add origin git@github.com:you/claude-config.git
claude-sync push
```

## Quick Start

### First machine (where your config already lives)

The one-liner installer handles everything — init, repo creation, and first push.
If you installed manually, see the manual steps above.

### Every other machine

```bash
# One command — clones the repo and applies config to ~/.claude
claude-sync bootstrap git@github.com:you/claude-config.git
```

Done. Your `~/.claude` is now identical across machines.

### Keeping in sync

```bash
# After changing config on any machine
claude-sync push

# On other machines, pull the changes
claude-sync pull     # backs up current state first

# Check what's changed
claude-sync status
```

## Commands

### `claude-sync init`

Creates a git-backed sync repo at `~/.claude-sync` from your existing `~/.claude` directory.

- Scans `~/.claude` through the allowlist manifest
- Copies only config files (skips 1.6GB of ephemeral data)
- Rewrites absolute paths in `settings.json` to portable `{{HOME}}` tokens
- Creates `.gitattributes` enforcing LF line endings
- Makes an initial commit

```bash
claude-sync init                    # default location ~/.claude-sync
claude-sync init --repo-path ~/my-sync  # custom location
claude-sync init --force            # re-initialize existing repo
```

### `claude-sync push`

Scans `~/.claude` for changes, copies updated files to the sync repo with path rewriting, commits, and pushes to the remote.

```bash
claude-sync push
```

Output:
```
Pushed 3 files to remote
```

### `claude-sync pull`

Fetches remote changes and applies them to `~/.claude`. Always creates a timestamped backup first.

```bash
claude-sync pull
```

Output:
```
Pulled 5 files from remote
Backup saved to: /Users/you/.claude-sync-backups/2026-03-08T14-30-00
```

### `claude-sync status`

Shows local modifications, remote drift, and excluded file count.

```bash
claude-sync status
```

Output:
```
Local changes:
  M settings.json
  A commands/my-new-command.md
Remote is 2 commit(s) ahead -- run 'claude-sync pull'
Excluded: 847 files (not in sync manifest)
```

### `claude-sync bootstrap <repo-url>`

Sets up a new machine from an existing remote sync repo. Clones the repo, applies files to `~/.claude` with path expansion, and backs up any existing config.

```bash
claude-sync bootstrap git@github.com:you/claude-config.git
claude-sync bootstrap https://github.com/you/claude-config.git
claude-sync bootstrap <url> --force   # re-clone if sync repo exists
```

## What syncs (and what doesn't)

### Synced (your config — ~15MB)

| Path | What it is |
|------|-----------|
| `CLAUDE.md` | Global instructions and preferences |
| `settings.json` | Permissions, hooks, effort level (paths auto-rewritten) |
| `commands/` | Custom slash commands |
| `agents/` | Agent definitions |
| `hooks/` | Hook scripts |
| `get-shit-done/` | GSD framework |
| `package.json` | Dependencies |
| `gsd-file-manifest.json` | Framework state |
| `plugins/blocklist.json` | Plugin blocklist |
| `plugins/known_marketplaces.json` | Marketplace registry |
| `plugins/marketplaces/` | Marketplace configs |

### Excluded (machine-local — ~1.6GB)

`projects/`, `history.jsonl`, `debug/`, `telemetry/`, `session-env/`, `shell-snapshots/`, `statsig/`, `file-history/`, `todos/`, `plans/`, `paste-cache/`, `ide/`, `cache/`, `backups/`, `downloads/`, `tasks/`, `plugins/install-counts-cache.json`

These are session data, caches, and logs that regenerate automatically and would cause constant merge conflicts.

## Path portability

`settings.json` contains absolute paths like `/Users/you/.claude/hooks/my-hook.js` that break on other machines. claude-sync handles this transparently:

- **On push/init:** Rewrites `/Users/you` to `{{HOME}}` in the sync repo
- **On pull/bootstrap:** Expands `{{HOME}}` back to the local machine's home directory
- **Windows support:** Handles both forward-slash and backslash path variants, including JSON-escaped `\\` sequences

You never see the tokens — they exist only in the git repo.

## Safety

- **Backup before pull/bootstrap:** Current `~/.claude` state is saved to a timestamped directory in `~/.claude-sync-backups/` before any destructive operation
- **Line endings:** `.gitattributes` enforces LF everywhere — hook scripts won't break when synced from macOS to Linux
- **Clear errors:** Every operation reports user-friendly success/failure messages. No raw stack traces for expected errors (missing remote, auth failure, etc.)
- **No secrets:** The allowlist excludes everything except config files. No credentials, tokens, or session data are synced.

## How it works

```
~/.claude (1.6GB)                    ~/.claude-sync (git repo)
├── CLAUDE.md          ──sync──►     ├── CLAUDE.md
├── settings.json      ──rewrite──►  ├── settings.json ({{HOME}} tokens)
├── commands/          ──sync──►     ├── commands/
├── agents/            ──sync──►     ├── agents/
├── hooks/             ──sync──►     ├── hooks/
├── projects/          ✗ excluded    ├── .gitattributes (LF enforcement)
├── history.jsonl      ✗ excluded    └── .git/
├── debug/             ✗ excluded         └── remote → GitHub
├── telemetry/         ✗ excluded
└── ... (16 more)      ✗ excluded
```

The sync repo is a standard git repository. You can inspect it, view history, and resolve conflicts with normal git tools.

## Development

```bash
git clone https://github.com/berlinguyinca/claude-sync.git
cd claude-sync
npm install

# Run tests (109 tests)
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

### Project structure

```
src/
├── cli/
│   ├── index.ts              # Commander.js entry point
│   └── commands/
│       ├── init.ts           # claude-sync init
│       ├── push.ts           # claude-sync push
│       ├── pull.ts           # claude-sync pull
│       ├── status.ts         # claude-sync status
│       └── bootstrap.ts      # claude-sync bootstrap
├── core/
│   ├── manifest.ts           # Allowlist of sync targets
│   ├── scanner.ts            # Directory scanner filtered by manifest
│   ├── path-rewriter.ts      # {{HOME}} token rewriting
│   ├── backup.ts             # Timestamped backup creation
│   └── sync-engine.ts        # Push/pull/status orchestration
├── git/
│   └── repo.ts               # Git operations wrapper (simple-git)
├── platform/
│   └── paths.ts              # Cross-platform path resolution
└── index.ts                  # Library exports
```

## License

MIT
