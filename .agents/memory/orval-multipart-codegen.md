---
name: Orval multipart/form-data codegen is broken
description: When to avoid declaring multipart request bodies in the OpenAPI spec and use a manual fetch instead.
---

# Orval multipart/form-data codegen is broken

Declaring a `multipart/form-data` requestBody in `lib/api-spec/openapi.yaml` makes Orval
generate a broken client: an unusable `Blob`-typed param plus a duplicate export that fails
typecheck.

**Why:** Orval's multipart support does not map file-upload bodies cleanly for this repo's
client/zod generators.

**How to apply:** For file-upload endpoints, define the *path + responses* in the spec but
OMIT the `requestBody`. On the frontend, POST with a manual `fetch` + `FormData` (field name
matching the server's multer field, `credentials: "include"`), then invalidate the relevant
query keys. Server-side still validates the upload (multer `fileFilter` + `limits`). Example:
the Hesabat `POST /company/logo` endpoint uses this pattern.
