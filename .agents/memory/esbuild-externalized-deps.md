---
name: esbuild externalized deps crash single-file deploy
description: Why the Hostinger single-bundle deploy can crash at boot with ERR_MODULE_NOT_FOUND even though dev works
---

# esbuild `external` list vs. zero-dep single-file deploy

The api-server is shipped to Hostinger as ONE bundled file (`dist/index.mjs`) with a
deploy `package.json` that lists **zero dependencies** (see `scripts/build-hostinger.sh`).
So anything esbuild marks `external` is NOT bundled AND NOT installed on the server →
the app crashes the instant it boots with `ERR_MODULE_NOT_FOUND: Cannot find package '<x>'`
→ Hostinger serves **503**.

`artifacts/api-server/build.mjs` ships a long defensive `external` list (sharp, bcrypt,
knex, typeorm, nodemailer, handlebars, …). Most are never imported, so they're harmless.
But the moment a route actually imports one of them, the single-file deploy breaks.

**Rule:** if you add a runtime dependency to the api-server, check it is NOT in the
`external` array in `build.mjs`. If it is and you genuinely use it, remove it from
`external` so esbuild bundles it (preferred — keeps the zero-dep single-file model).
Pure-JS packages like `nodemailer` bundle fine.

**Why:** dev (`tsx`/vite) resolves from `node_modules`, so this NEVER reproduces in dev —
only the bundled `dist/index.mjs` is affected. (nodemailer was added for the contact-form
email and silently stayed externalized; the live site 503'd while dev was perfectly fine.)

**How to verify before shipping:** extract the deploy zip and boot the bundle with a throwaway
DB URL + PORT, e.g.
`DATABASE_URL='postgresql://u:p@localhost:5432/x' PORT=5071 node dist/index.mjs` —
it must print `✓ Server listening` with no `ERR_MODULE_NOT_FOUND`. DB connect-refused errors
in that test are expected (real Neon URL works in prod).
