---
name: Hesabat accounting SaaS mockups
description: Conventions + gotchas for the Egyptian cloud-accounting (SaaS) visual mockups in the mockup-sandbox canvas
---

Track B = visual mockups ONLY (not a real app) for a new multi-tenant cloud accounting SaaS for Egyptian SMEs, modeled on Manager.io/Wafeq. Client is HG Financial Consulting (Egyptian audit firm); user is a non-technical auditor who responds in Egyptian Arabic and is visual.

- All screens live in `artifacts/mockup-sandbox/src/components/mockups/<folder>/<Component>.tsx`, each with its own `_group.css` copied from `chart-of-accounts/_group.css` (theme-hesabat: Cairo font, deep-navy/sand). Never edit global index.css.
- Sidebar markup (9 RTL nav items) is duplicated per screen — keep the list in sync when adding modules.
- Screens built so far: dashboard, chart-of-accounts, customers-suppliers, bank-cash, company-profile, taxes, advances (العهد والسلف), cost-centers (مراكز التكلفة), financial-reports (التقارير المالية: ميزان المراجعة/قائمة الدخل/المركز المالي).

**Why it matters / gotcha:** the user is an auditor — financial mock DATA must be internally consistent, not just look right. A trial balance must actually balance (Σ debit = Σ credit) and tie to the income statement (net profit) and balance sheet (retained earnings = prior + current profit). Plausible-but-unbalanced demo numbers will be caught instantly.
**How to apply:** when inventing demo figures for any financial statement, reconcile the numbers across statements before presenting.
