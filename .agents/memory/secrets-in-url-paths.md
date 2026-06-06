---
name: Secrets in URL paths get logged
description: Tokens carried in URL path segments leak into request logs unless the logger serializer redacts them
---

# Secret tokens in URL paths leak into logs

When a secret (invitation token, password-reset token, magic-link token) is carried in a URL **path** segment (e.g. `GET /invitations/:token`), the pino-http request serializer in `artifacts/api-server/src/app.ts` logs `req.url` — so the raw secret ends up in plaintext logs even though it is hashed at rest in the DB.

**Why:** code review caught raw invite tokens in api-server logs. Hashing the token in the DB is not enough; the transport path is also a leak surface.

**How to apply:** any time a secret rides in a URL path, redact it in the logger's `req` serializer (regex-replace the segment with `[redacted]`), or move the secret to a POST body/header. The query-string is already stripped (`split("?")[0]`), but path segments are not — handle them explicitly.
