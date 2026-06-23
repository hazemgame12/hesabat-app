---
name: GitHub push from Replit
description: How to push code to GitHub from Replit when git push is blocked by replit-git-askpass.
---

## The rule

`git push` from Replit bash always fails — `replit-git-askpass` intercepts credentials even when the token is embedded in the remote URL. `git remote set-url` is also blocked (creates `.git/config.lock`). Use `pnpm run push-github` instead.

**Why:** Replit's agent sandbox intercepts all git credential operations via a custom askpass program. There is no way to bypass it from bash or code_execution.

**How to apply:** After any set of commits you want live on production, run from the Shell tab:

```bash
pnpm run push-github
```

The script (`scripts/push-github.py`):
1. Reads `.push-github-sha` to find the last pushed local SHA.
2. Diffs changed files between that SHA and local HEAD (skips `attached_assets/`, `node_modules/`, etc.).
3. Creates blobs → tree → commit via GitHub Git Data API in one clean commit.
4. Updates `refs/heads/main` on GitHub.
5. Optionally triggers the VPS deploy webhook (`hg-audit.com/api/webhook/deploy`).
6. Saves the new SHA to `.push-github-sha` for next run.

## Token availability

- `GITHUB_TOKEN` IS available in bash: `printenv GITHUB_TOKEN` works.
- `GITHUB_TOKEN` is NOT available in code_execution: `process.env` is undefined and `execSync('printenv GITHUB_TOKEN')` fails.
- The script uses `os.environ.get("GITHUB_TOKEN")` in Python, which works from bash subprocess correctly.

## VPS deploy webhook

- URL: `https://hg-audit.com/api/webhook/deploy`
- Signed with `ADMIN_SECRET` via HMAC-SHA256 (`x-hub-signature-256` header).
- Payload: `{"ref":"refs/heads/main"}`
- The script handles webhook triggering automatically after a successful push.

## First run

On the first run (no `.push-github-sha` file), the script asks for confirmation before uploading all tracked files. Answer `y` to proceed.
