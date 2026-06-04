---
name: Hostinger env vars not persisting (one-click social OAuth blocked)
description: Why the dashboard one-click Facebook/Meta connect couldn't be enabled on the Hostinger-deployed hg-audit.com, and the reliable alternatives.
---

# Hostinger Node.js Deployments — new env vars silently revert

On hg-audit.com's Hostinger Node.js **Deployments → settings** page, newly added
Environment Variables (`META_APP_ID`, `META_APP_SECRET`) **vanish after "Save and
redeploy"**. Existing vars (DATABASE_URL, SMTP_*, GEMINI_API_KEY, SITE_URL) work
fine; only *newly added* ones fail to persist. Deleting redundant vars to "make
room" did not help, so it is not a simple count limit — it behaves like the panel
reverting to a snapshot/source on redeploy.

**Why it matters:** the one-click in-dashboard social OAuth ("الربط بنقرة واحدة")
only appears when `isOAuthConfigured()` is true, which requires those two env vars.
The api-server reads config **only from `process.env`** (no `dotenv`, no `.env`
loaded at runtime — confirmed), and the deploy bundle ships only `.env.example`
(a template, never loaded). So there is no in-bundle way to inject app creds; the
Hostinger panel is the only mechanism, and it won't keep them.

**Reliable alternatives (when the user resumes):**
- Hostinger support / "Ask AI": they can see the account and fix env persistence
  or point to the correct env location. Highest leverage — it's a platform issue.
- **DB-backed manual token**: the per-page social credentials (Page ID + Page
  Access Token) are stored AES-256-GCM encrypted in the `social_credentials`
  table, **independent of env vars and redeploys** — that's why a stale/invalid
  manual token persisted across deploys. This path needs NO Hostinger env change,
  but requires obtaining a long-lived Page Access Token (the hard part the
  one-click OAuth would otherwise automate).

**How to apply:** don't keep retrying the Hostinger env panel for new vars — it's
the platform fighting back, not user error. Route to Hostinger support, or use the
DB-backed manual token path. The site itself is healthy (`/`, `/api/healthz` → 200;
OAuth routes deployed → 401/302), so this is isolated to enabling auto-posting.
