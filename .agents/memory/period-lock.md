---
name: Hesabat Period Lock
description: Soft reversible period lock (قفل الفترة) — isWriteBlocked pattern, HTTP 423, company.lockedThrough
---

## Rule
`isWriteBlocked(executor, companyId, date)` returns `"period_locked" | "fiscal_closed" | false`.
- `period_locked` → HTTP 423
- `fiscal_closed` → HTTP 400
- Use `WRITE_BLOCK_MSG[reason]` for the Arabic error message.

**Why:** Period lock is soft (reversible by owner) vs fiscal year close (permanent, generates closing JE). Period lock must take priority in the check order so its distinct error+status code surfaces correctly.

## How to apply
Add to any route that writes a dated financial record:
```typescript
const wb = await isWriteBlocked(db, companyId, date);
if (wb) {
  res.status(wb === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wb] });
  return;
}
```
For monthly periods (payroll, depreciation), use `period + "-01"` as the date.
For multi-date ops (update), check both old and new date with `||`.
For inside-tx approve flows, throw `new ApproveError(423|400, WRITE_BLOCK_MSG[wb])`.

## API
- `PATCH /api/company/period-lock` body: `{ lockedThrough: "YYYY-MM-DD" | null }`
- Permission: `fiscalyear:manage`
- HTTP 423 is the correct status for a period-locked write rejection.

## Frontend
- `PeriodLockCard` lives in `fiscal-years.tsx` (FiscalYears settings tab)
- Hooks: `useUpdatePeriodLock`, `useGetCompany`, `getGetCompanyQueryKey`
- i18n keys under `fiscalYearsPage.periodLock.*` in ar.json + en.json
