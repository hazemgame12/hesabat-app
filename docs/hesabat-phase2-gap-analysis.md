# Hesabat — Phase 2 Gap Analysis & Roadmap

Reference workflows: **ERPNext** + **Odoo** (functional reference only — no source copied). Goal: a simple, modern, easy accounting system for SMEs. Priority = accounting correctness, usability, and automation, **not** more screens.

This doc is the deliverable requested in the Phase 2 strategy: (1) gap analysis, (2) missing business logic, (3) DB changes, (4) APIs, (5) screen changes, (6) roadmap by module.

---

## 1. Current state (what already exists)

Phase 1 shipped 12+ milestones. Confirmed present in code today:

| Area | Status |
| --- | --- |
| Chart of Accounts (tree, bilingual, auto-code, tenant-scoped) | ✅ |
| Journal Entries (double-entry, multi-currency base amounts, attachments, Excel in/out) | ✅ |
| Journal **approval workflow** draft → pending → approved → posted + reverse/adjustment | ✅ (T01) |
| Cost centers / projects, Taxes (VAT/WHT + country templates), Currencies + FX auto-update | ✅ |
| Reports: Trial Balance, Income Statement (P&L), Balance Sheet, General Ledger | ✅ |
| AR/AP reports: party statement, aging, outstanding, sales/purchases by party, VAT report, employee statement | ✅ |
| Customers & Suppliers (master + auto subsidiary ledger, derived balances) | ✅ |
| Invoicing (sales/purchase, line-typed: service/inventory/fixed_asset) + approval posting | ✅ |
| Payments: Receipt Vouchers (collection) + Payment Vouchers (payment) + allocations | ✅ |
| Inventory (items, receipt/issue/adjustment, weighted-avg, single warehouse, derived stock) | ✅ |
| Banking (bank/cash accounts, movements, transfers, **Excel statement import**, **manual** matching, reconciliation report) | ✅ |
| Fixed assets & depreciation, Payroll & employees, Advances & custodies, Opening balances | ✅ |

---

## 2. Gap analysis vs ERPNext (missing business logic)

### Accounting
- ✅ Chart of Accounts, Journal Entries, General Ledger, P&L, Balance Sheet.
- ❌ **Fiscal year management** — open/close a year, carry-forward opening entry, block posting into a closed/locked period.
- ❌ **Trial Balance is single-period** — ERPNext shows 6 columns (Opening Dr/Cr, Movement Dr/Cr, Closing Dr/Cr).
- ❌ **PDF export** — only Excel today.
- ❌ **Audit log** — no record of who created/edited/approved what.
- ⚠️ Cost-center / project filtering on reports is partial.

### Customers / AR
- ✅ Customer master, statement, receipts/collection cycle, AR aging.
- ❌ **Credit notes / sales returns** — no way to credit a customer or reverse a sales invoice.
- ⚠️ **Credit limit** is stored but not enforced on new invoices.

### Suppliers / AP
- ✅ Supplier master, statement, payment cycle, AP aging.
- ❌ **Debit notes / purchase returns** — no supplier return flow.

### Inventory (keep simple — manufacturing/BOM/MRP/multi-warehouse intentionally excluded)
- ✅ Item master, goods receipt (movement + via purchase invoice), goods issue, stock balance, weighted-avg cost.
- ❌ **Stock ledger / stock movement report** — a proper per-item movement+valuation report (opening/in/out/closing).
- ⚠️ **Units of measure** is a free-text field, not a small master list.

### Banking (PRIORITY — stated competitive advantage)
- ✅ Bank & cash accounts, Receipt/Payment vouchers, **Excel statement import**, reconciliation report.
- ❌ **Automatic matching engine** — today matching is fully manual (checkbox + dropdown). ERPNext auto-suggests matches by amount + date + reference. **This is the single highest-value gap.**

---

## 3. Database changes required (by module)

- **Audit log:** new `audit_log` (companyId, userId, action, entity, entityId, oldValue jsonb, newValue jsonb, createdAt). Append-only.
- **Fiscal year:** new `fiscal_years` (companyId, name, startDate, endDate, status open|closed). Add closed-period guard usage across posting paths.
- **Bank auto-match:** no new table strictly required — reuse `bank_statement_lines` + `bank_movements`; matching is computed. Optionally a `match_score`/`match_status` column on `bank_statement_lines`.
- **Credit/debit notes:** reuse `invoices` with a new `kind` value (`sales_return` / `purchase_return`) + a `relatedInvoiceId` FK, or a `docType` flag. No new table needed.
- **Inventory stock ledger:** none — derived from `inventory_movements`.
- **Units of measure (optional):** small `units_of_measure` master or a fixed enum.

## 4. APIs required (by module)

- **Audit log:** `writeAudit()` helper (in-tx) + `GET /audit` (filter entity/date/user). No delete route.
- **Fiscal year:** `GET/POST /fiscal-years`, `POST /fiscal-years/:id/close` (carry-forward), posting guard in journal/invoice/bank/payroll posting paths.
- **Bank auto-match:** `POST /bank/reconciliations/:id/auto-match` → returns suggested pairings (amount+date±tolerance+reference) for user confirmation; confirm reuses existing match endpoint.
- **6-column trial balance + PDF:** extend `financial-reports.ts`; add a shared PDF helper alongside `lib/excel.ts`.
- **Credit/debit notes:** extend `invoices.ts` approve posting to handle reversal direction for return kinds.

## 5. Screen changes required (no new screens unless they serve a real workflow)

- **Audit log:** 1 new read-only page with filters.
- **Fiscal year:** small section in Company Settings (open/close years).
- **Bank auto-match:** NO new screen — add an "auto-match" button + suggestions list inside the existing reconciliation detail.
- **6-col trial balance + PDF:** extend existing reports page; add PDF buttons next to existing Excel buttons.
- **Credit/debit notes:** reuse the existing invoice editor with a "return" mode + a "create return" action from an invoice.
- **Stock ledger report:** a tab in the existing reports/inventory page.

---

## 6. Roadmap by module (ordered by value, do one at a time)

1. **Banking — Automatic matching engine** (PRIORITY / competitive advantage). Builds directly on the existing Excel import + reconciliation. Suggest matches by amount + date tolerance + reference; user confirms.
2. **Audit Log** (cross-cutting trust/integrity). Already scoped as Task #42.
3. **Fiscal Year management** (open/close + carry-forward + period lock). Already scoped as Task #43.
4. **Reporting completeness** — 6-column Trial Balance + PDF export across ledger/trial balance.
5. **Credit notes & purchase returns** (AR/AP completeness).
6. **Inventory stock ledger report** (+ optional units-of-measure master) — keep simple.
7. **Dashboard modernization** (counts, bank vs cash split, key KPIs).

> Deferred (low priority, on request): the broader analytical reports bundle (cash flow statement, sales/purchases-by-item, monthly inventory summary, FX revaluation, cash forecast) — Task #44 context.

---

### Guiding principles (from the strategy)
- Simplicity over enterprise complexity. Fast data entry. Excellent reports. Easy bank reconciliation. Excel in/out. Modern dashboard. Clean UX.
- Reuse existing workflows/screens; add a screen only when it serves a real accounting workflow.
