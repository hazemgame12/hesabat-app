---
name: Hesabat journal entries (multi-currency, attachments, Excel)
description: Design rules and sharp edges for the Hesabat journal-entries milestone
---

# Hesabat journal entries

Double-entry journal with per-line multi-currency and base-currency conversion, file attachments, and Excel import/export. Backend in `@workspace/api-server` (`routes/journal.ts`), UI in `artifacts/hesabat/src/pages/journal.tsx`.

## Multi-currency rule
- Each line stores `currency` + `exchangeRate` + `debit`/`credit`; `debitBase = debit * exchangeRate`, `creditBase = credit * exchangeRate`. Balance check is on the BASE amounts (Σ debitBase == Σ creditBase) with a sub-cent tolerance (0.005), NOT on the raw entered amounts.
- Base currency comes from `companies.baseCurrency` (the AuthUser object has none → frontend reads it via `useGetCompany`, not the current-user hook).

## Attachments (local disk, not object storage)
- Chose multer + local disk (mirrors the company-logo upload pattern; app targets a Hostinger VPS with a persistent disk) over object storage. Files land in the shared `uploadsDir` from `routes/uploads.ts`, served statically at `/api/uploads`. `objectKey` is a server-generated random filename — never the user's name — which also defuses path traversal.
- **Downloads MUST force `Content-Disposition: attachment`** (never inline) to defuse stored-XSS from uploaded HTML/SVG; SVG/HTML are also excluded from the type whitelist.
- Original filename is captured via `Buffer.from(name,'latin1').toString('utf8')` so Arabic filenames survive multer's latin1 mangling.
- Clean up disk files in every failure path: unlink on entry-not-found AND in the insert catch block; on journal-entry delete, read attachment `objectKey`s BEFORE the cascade delete then unlink after the DB delete succeeds.

## Excel (exceljs)
- Export/import and attachment download are plain binary Express routes — deliberately NOT in the OpenAPI spec (codegen can't model binary streams). Upload/delete-attachment ARE in the spec.
- **Route ordering trap:** `GET /journal/export` is two path segments and collides with `GET /journal/:id`. It MUST be registered BEFORE the `:id` param route or Express treats "export" as an id. (`POST /journal/import` is safe — no `POST /journal/:id` exists.)
- Import groups rows by the `entryNo` column → one draft entry per group; resolves account `code`→id company-scoped; reuses `computeAndValidate` for balance; rejects missing/group accounts; persists all groups in ONE transaction (all-or-nothing) with `entryNo` sequenced inside the tx. Round-trips the export format.

## Frontend
- Attachments only after the entry is saved (needs an `entryId`); before save the section shows a "save first" hint.
- Upload uses raw `fetch` + `FormData` with `credentials:"include"` (same as company-logo) — the generated mutation hooks don't handle multipart. Delete uses the generated `useDeleteJournalAttachment`. After upload/delete, invalidate `getGetJournalEntryQueryKey(entryId)` to refresh the list.
