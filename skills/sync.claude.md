Synchronize AI tool configuration across machines using ai-sync.

Run the following commands in sequence using the Bash tool and report the results. Stop on the first failure — do not continue to the next step.

1. First, pull any remote changes:
   ```
   ai-sync pull -v
   ```

2. Then, push local changes to the remote:
   ```
   ai-sync push -v
   ```

3. Finally, show the current sync status:
   ```
   ai-sync status -v
   ```

After all commands complete, summarize:
- How many files were pulled and pushed
- Which files changed (list the verbose output)
- Whether everything is now in sync

If any command fails:
- **"No remote configured"** → suggest running `ai-sync init` then adding a remote
- **"Remote has changes"** → run `ai-sync pull` first, then retry
- **"Sync repo already exists"** → suggest `ai-sync push` instead of init
- **SSH/auth errors** → suggest checking `ssh-add -l` and `gh auth status`
- **Other errors** → show the full error message and suggest checking `ai-sync status -v`
