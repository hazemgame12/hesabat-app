---
name: Hesabat i18n (Arabic/English)
description: How bilingual RTL/LTR is wired in artifacts/hesabat and the conventions any new screen must follow.
---

# Hesabat bilingual (Arabic default, English secondary)

Library: i18next + react-i18next (client-only, in hesabat devDependencies). Strings live in
`src/i18n/locales/{ar,en}.json` (Arabic authored first, en mirrors key-for-key). Init lives in
`src/i18n/index.ts`; persisted under localStorage key `hesabat.lang`.

## Rules for any new screen
- **Never hardcode user-facing copy.** Use `t("namespace.key")`. The only literal allowed is the
  brand logomark "ح" (a styled glyph, not copy). Avatar/initials fallbacks must come from a key
  (e.g. `nav.defaultInitial` / `team.defaultInitial`), NOT a hardcoded Arabic letter — otherwise it
  shows Arabic in English mode.
- **Direction flips automatically** because init syncs `<html lang>` + `<html dir>` on load and on
  `languageChanged`. So lay out with Tailwind **logical** props — `ms/me`, `ps/pe`, `start/end`,
  `text-start` — and `rtl:` variants for icon mirroring. Do NOT add `dir="rtl"` / `text-right` to
  containers; that breaks the English LTR layout.

## Decision: group/tab by stable IDs, translate only for display
**Why:** accounts.tsx originally keyed its tree, tabs, and group-meta by the Arabic label values
("الأصول" …), which silently breaks the moment the UI language changes.
**How to apply:** key any grouping/state/lookup by a stable id (account `type`: asset/liability/
equity/revenue/expense; role id; etc.) and only call `t(...)` at render. Same for the "all" tab —
use an `"all"` sentinel, label it via `t("common.all")`.

## Decision: roles via i18n, not @workspace/permissions labels
`@workspace/permissions` exports Arabic `ROLE_LABELS`/`ROLE_DESCRIPTIONS`. Render roles through
`t("roles.<id>.label" / ".desc")` instead so they localize. Keep using the lib for the role id list
(`ASSIGNABLE_ROLES`) and capability logic.

## Locale helpers
`@workspace/locale` exposes lang-aware `countryName/currencyName/countryLabel/currencyLabel(code, lang)`
and `formatCurrency(amount, currency, lang)`. Derive lang in a component with
`const lang = (i18n.language === "en" ? "en" : "ar") as Lang;`.

## Verifying English quickly
Screenshot tool can't set localStorage. To eyeball the en layout, temporarily set `lng: "en"` in the
init `i18n.init({...})`, screenshot, then revert to `lng: readStoredLang()`.
