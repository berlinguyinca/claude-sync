Synchronize OpenCode configuration across machines using ai-sync.

Run the following commands in sequence using the Bash tool and report the results:

1. First, pull any remote changes:
   ```
   ai-sync pull
   ```

2. Then, push local changes to the remote:
   ```
   ai-sync push
   ```

3. Finally, show the current sync status:
   ```
   ai-sync status
   ```

Summarize what happened: how many files were pulled/pushed, and whether everything is now in sync.

If any command fails, show the error and suggest a fix (e.g., run `ai-sync init` if not initialized, or check git remote configuration).
