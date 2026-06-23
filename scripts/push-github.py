#!/usr/bin/env python3
"""
push-github.py — Push local commits to GitHub via the Git Data API.

Tracks the last-pushed local SHA in .push-github-sha so it only uploads
files that changed since the previous push, not the entire repo.

Usage:
  python3 scripts/push-github.py

Requires:
  GITHUB_TOKEN env var with repo write access.
"""

import base64, json, os, subprocess, sys, urllib.request, urllib.error

# ── Config ───────────────────────────────────────────────────────────────────
REPO     = "hazemgame12/hesabat-app"
BRANCH   = "main"
WORKDIR  = subprocess.check_output(
    ["git", "--no-optional-locks", "rev-parse", "--show-toplevel"], text=True
).strip()
SHA_FILE = os.path.join(WORKDIR, ".push-github-sha")  # tracks last pushed local SHA

# Paths to never upload (binary dumps, scratch, editor state)
SKIP_PREFIXES = [
    "attached_assets/",
    "node_modules/",
    ".git/",
    ".local/state/",
]
SKIP_SUFFIXES = [".log"]

# ── Helpers ──────────────────────────────────────────────────────────────────
def get_token() -> str:
    t = os.environ.get("GITHUB_TOKEN", "").strip()
    if not t:
        sys.exit("❌  GITHUB_TOKEN is not set.")
    return t

def gh(method: str, path: str, body=None, token: str = "") -> dict:
    url = f"https://api.github.com{path}"
    req = urllib.request.Request(url, method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "hesabat-push-script",
            "Accept": "application/vnd.github+json",
        })
    if body is not None:
        req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        sys.exit(f"❌  GitHub API {method} {path} → {e.code}: {msg}")

def git(*args) -> str:
    return subprocess.check_output(
        ["git", "--no-optional-locks", *args], text=True, cwd=WORKDIR
    ).strip()

def should_skip(path: str) -> bool:
    for p in SKIP_PREFIXES:
        if path.startswith(p):
            return True
    for s in SKIP_SUFFIXES:
        if path.endswith(s):
            return True
    return False

def load_last_sha() -> str:
    if os.path.isfile(SHA_FILE):
        return open(SHA_FILE).read().strip()
    return ""

def save_last_sha(sha: str):
    with open(SHA_FILE, "w") as f:
        f.write(sha + "\n")

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    token     = get_token()
    local_sha = git("rev-parse", "HEAD")
    local_msg = git("log", "-1", "--pretty=%s")

    print(f"🔍  Local HEAD: {local_sha[:12]}  ({local_msg})")

    # Get GitHub current HEAD to update later
    gh_ref    = gh("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}", token=token)
    gh_sha    = gh_ref["object"]["sha"]
    print(f"    GitHub HEAD: {gh_sha[:12]}")

    # Determine base SHA for diff (last successfully pushed local SHA)
    base_sha = load_last_sha()
    if not base_sha:
        # First run — ask user to confirm full push
        all_files = git("ls-files").splitlines()
        prod_files = [f for f in all_files if not should_skip(f)]
        print(f"\n⚠️   No previous push recorded. Will upload {len(prod_files)} files.")
        ans = input("    Continue? [y/N] ").strip().lower()
        if ans != "y":
            sys.exit("Aborted.")
        base_sha = None
    elif base_sha == local_sha:
        print("✅  Already up to date — nothing to push.")
        return
    else:
        print(f"    Last push:   {base_sha[:12]}")

    # Diff
    if base_sha:
        try:
            diff_out = git("diff", "--name-status", base_sha, local_sha)
        except subprocess.CalledProcessError:
            print(f"⚠️   Base SHA {base_sha[:12]} not found — falling back to full diff")
            diff_out = git("diff", "--name-status",
                           "4b825dc642cb6eb9a060e54bf8d69288fbee4904", local_sha)
    else:
        diff_out = git("diff", "--name-status",
                       "4b825dc642cb6eb9a060e54bf8d69288fbee4904", local_sha)

    changed, deleted = [], []
    for line in diff_out.splitlines():
        if not line.strip():
            continue
        parts  = line.split("\t")
        status = parts[0][0]
        fpath  = parts[-1]
        if should_skip(fpath):
            continue
        if status == "D":
            deleted.append(fpath)
        else:
            changed.append(fpath)

    if not changed and not deleted:
        print("✅  No files to push (all changes are in skipped paths).")
        save_last_sha(local_sha)
        return

    print(f"\n📁  {len(changed)} changed,  {len(deleted)} deleted")
    for f in changed[:8]:
        print(f"    ✏️   {f}")
    if len(changed) > 8:
        print(f"    … and {len(changed)-8} more")
    for f in deleted:
        print(f"    🗑️   {f}")

    # Get base tree from GitHub HEAD commit
    gh_commit     = gh("GET", f"/repos/{REPO}/git/commits/{gh_sha}", token=token)
    base_tree_sha = gh_commit["tree"]["sha"]

    # Create blobs
    print(f"\n📤  Uploading…")
    tree_entries = []
    for fpath in changed:
        local_full = os.path.join(WORKDIR, fpath)
        if not os.path.isfile(local_full):
            print(f"    ⚠️   {fpath} missing locally — skipped")
            continue
        raw        = open(local_full, "rb").read()
        content_b64 = base64.b64encode(raw).decode()
        blob       = gh("POST", f"/repos/{REPO}/git/blobs",
                        body={"content": content_b64, "encoding": "base64"},
                        token=token)
        tree_entries.append({"path": fpath, "mode": "100644",
                              "type": "blob", "sha": blob["sha"]})
        sys.stdout.write(f"    ✅  {fpath}\n"); sys.stdout.flush()

    for fpath in deleted:
        tree_entries.append({"path": fpath, "mode": "100644",
                              "type": "blob", "sha": None})

    # Create tree → commit → update ref
    print(f"\n🌲  Creating tree…")
    new_tree   = gh("POST", f"/repos/{REPO}/git/trees",
                    body={"base_tree": base_tree_sha, "tree": tree_entries},
                    token=token)

    print(f"💾  Creating commit…")
    commit_msg = f"deploy: {local_msg}"
    new_commit = gh("POST", f"/repos/{REPO}/git/commits",
                    body={"message": commit_msg,
                          "tree": new_tree["sha"],
                          "parents": [gh_sha]},
                    token=token)

    print(f"🔗  Updating branch…")
    gh("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}",
       body={"sha": new_commit["sha"], "force": False}, token=token)

    save_last_sha(local_sha)
    print(f"\n✅  Done!  GitHub {BRANCH} → {new_commit['sha'][:12]}")
    print(f"    \"{commit_msg}\"")

    # Trigger deploy webhook
    ans = input("\n🚀  Trigger VPS deploy webhook? [Y/n] ").strip().lower()
    if ans in ("", "y"):
        import hashlib, hmac
        secret = os.environ.get("ADMIN_SECRET", "")
        body   = b'{"ref":"refs/heads/main"}'
        sig    = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        req    = urllib.request.Request(
            "https://hg-audit.com/api/webhook/deploy",
            data=body, method="POST",
            headers={"Content-Type": "application/json",
                     "x-hub-signature-256": sig,
                     "User-Agent": "hesabat-push-script"})
        try:
            with urllib.request.urlopen(req) as r:
                print(f"    Webhook: {json.load(r)}")
        except Exception as e:
            print(f"    Webhook error: {e}")

if __name__ == "__main__":
    main()
