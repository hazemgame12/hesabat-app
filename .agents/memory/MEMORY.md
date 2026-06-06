# Memory Index

- [esbuild externalized deps crash deploy](esbuild-externalized-deps.md) — api-server ships as one zero-dep bundle; any used pkg left in build.mjs `external` → ERR_MODULE_NOT_FOUND → 503 (dev hides it).
- [Hostinger env vars not persisting](hostinger-env-vars-not-persisting.md) — new Hostinger Deployments env vars vanish after Save+redeploy; blocks one-click social OAuth (app reads only process.env). Use support or DB-backed manual token.
- [Hesabat accounting SaaS mockups](hesabat-mockups.md) — visual-only mockups for an Egyptian cloud-accounting SaaS; financial demo data must reconcile across statements (auditor user).
- [Hesabat architecture](hesabat-architecture.md) — multi-tenant accounting app: scope all queries by companyId AND re-validate cross-row FKs (parentId) to caller's company; native scrypt+cookie auth; roles/permissions/invitations; QueryClient retry:false.
- [Secrets in URL paths](secrets-in-url-paths.md) — tokens in URL path segments leak into request logs; redact them in the pino-http req serializer (query-string already stripped, path isn't).
- [Orval multipart codegen broken](orval-multipart-codegen.md) — declaring multipart/form-data requestBody generates broken Blob type + dup export; omit requestBody, upload via manual fetch+FormData.
