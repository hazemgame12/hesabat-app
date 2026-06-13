---
name: VPS GitHub Actions Secrets
description: GitHub Actions production deploy requires secrets that are missing; VPS deploy workflow and how to configure it
---

## The rule

The GitHub Actions `deploy.yml` workflow needs these 3 secrets in the **production** environment on GitHub:
- `VPS_HOST` — IP address: 76.13.150.226
- `VPS_USER` — root (or the configured deploy user)
- `VPS_SSH_KEY` — private SSH key whose public key is in `/root/.ssh/authorized_keys` on the VPS

**Why:** The `appleboy/ssh-action` uses key-based SSH auth, not password auth. No secrets = deploy step fails even though build passes.

## How to apply

To set them up:
1. Generate an SSH key pair: `ssh-keygen -t ed25519 -C "github-actions" -f /tmp/deploy_key`
2. Copy public key to VPS: add `deploy_key.pub` content to `/root/.ssh/authorized_keys` on the VPS
3. Add private key as GitHub secret: Go to repo → Settings → Environments → production → add `VPS_SSH_KEY` (content of `deploy_key`), `VPS_HOST=76.13.150.226`, `VPS_USER=root`

## Manual deploy (fallback)

If GitHub Actions is not set up, manually run on VPS:
```bash
cd /var/www/hesabat
git pull https://github.com/hazemgame12/hesabat-app.git main
pnpm install --no-frozen-lockfile
NODE_ENV=production pnpm --filter @workspace/hesabat exec vite build --config vite.production.config.ts
pnpm --filter @workspace/api-server run build
pm2 restart hesabat-api
```

## Previous password approach

Previous sessions used password SSH (H@Hazem2009) but this no longer works — either the password changed or password auth was disabled on the VPS.
