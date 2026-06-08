---
name: Hesabat Excel import/export pattern
description: How Excel import/export is wired across modules (raw routes, no codegen)
---

# Hesabat Excel import/export

- Shared backend helper `artifacts/api-server/src/lib/excel.ts`: multer memoryStorage (`.xlsx` only), `cellStr`/`cellNum`, `exportWorkbook(res, fileName, sheets)` (styled header + auto widths + download headers), `parseSheet` (header-keyed rows).
- **Excel routes are RAW — no openapi/codegen.** Mirror `journal.ts`/`customers.ts`: export = `GET` streaming a workbook (frontend `window.open`); import = `POST` multipart, all-or-nothing in ONE `db.transaction`, with company-scoped FK resolution (resolve codes/names to ids filtered by `companyId`; reject cross-tenant). Reuse the module's existing posting/locking rules (e.g. `lockCompanyEntryNo`).
- **Import = master-data only; report-like modules are export-only.** Import+export: chart of accounts, customers, suppliers, inventory items, fixed assets, employees, cost centers. Export only: taxes, currencies, invoices.
- Frontend: shared `ExcelToolbar` + generic `common.*` i18n keys (`exportExcel`/`importExcel`/`importing`/`importSuccess`/`importError`) so subagent-delegated rollouts don't collide on translation keys. Customers is the reference impl.
