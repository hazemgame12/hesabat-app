export const ROLES = [
  "owner",
  "manager",
  "accountant",
  "data_entry",
  "viewer",
] as const;

export type RoleId = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleId, string> = {
  owner: "صاحب الشركة",
  manager: "مدير",
  accountant: "محاسب",
  data_entry: "مُدخِل بيانات",
  viewer: "مشاهد",
};

export const ROLE_DESCRIPTIONS: Record<RoleId, string> = {
  owner: "تحكم كامل في النظام وإدارة الفريق والصلاحيات",
  manager: "كل العمليات المحاسبية بدون إدارة الفريق أو الاشتراك",
  accountant: "إضافة وتعديل الحسابات والقيود (بدون حذف)",
  data_entry: "إضافة البيانات فقط بدون تعديل أو حذف",
  viewer: "الاطلاع على التقارير فقط بدون أي تعديل",
};

export const CAPABILITIES = [
  "team:manage",
  "company:manage",
  "accounts:read",
  "accounts:create",
  "accounts:update",
  "accounts:delete",
  "taxes:read",
  "taxes:create",
  "taxes:update",
  "taxes:delete",
  "costCenters:read",
  "costCenters:create",
  "costCenters:update",
  "costCenters:delete",
  "currencies:read",
  "currencies:create",
  "currencies:update",
  "currencies:delete",
  "journal:read",
  "journal:create",
  "journal:update",
  "journal:delete",
  "journal:post",
  "journal:submit",
  "journal:approve",
  "assets:read",
  "assets:create",
  "assets:update",
  "assets:delete",
  "inventory:read",
  "inventory:create",
  "inventory:update",
  "inventory:delete",
  "payroll:read",
  "payroll:create",
  "payroll:update",
  "payroll:delete",
  "customers:read",
  "customers:create",
  "customers:update",
  "customers:delete",
  "suppliers:read",
  "suppliers:create",
  "suppliers:update",
  "suppliers:delete",
  "invoices:read",
  "invoices:create",
  "invoices:update",
  "invoices:delete",
  "invoices:approve",
  "payments:read",
  "payments:create",
  "payments:update",
  "payments:delete",
  "bank:read",
  "bank:create",
  "bank:update",
  "bank:delete",
  "advances:read",
  "advances:create",
  "advances:update",
  "advances:delete",
  "custodies:read",
  "custodies:create",
  "custodies:update",
  "custodies:delete",
  "audit:read",
  "fiscalyear:read",
  "fiscalyear:manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ACCOUNTS_FULL: Capability[] = [
  "accounts:read",
  "accounts:create",
  "accounts:update",
  "accounts:delete",
];

const TAXES_FULL: Capability[] = [
  "taxes:read",
  "taxes:create",
  "taxes:update",
  "taxes:delete",
];

const COST_CENTERS_FULL: Capability[] = [
  "costCenters:read",
  "costCenters:create",
  "costCenters:update",
  "costCenters:delete",
];

const CURRENCIES_FULL: Capability[] = [
  "currencies:read",
  "currencies:create",
  "currencies:update",
  "currencies:delete",
];

const JOURNAL_FULL: Capability[] = [
  "journal:read",
  "journal:create",
  "journal:update",
  "journal:delete",
  "journal:post",
  "journal:submit",
  "journal:approve",
];

const ASSETS_FULL: Capability[] = [
  "assets:read",
  "assets:create",
  "assets:update",
  "assets:delete",
];

const INVENTORY_FULL: Capability[] = [
  "inventory:read",
  "inventory:create",
  "inventory:update",
  "inventory:delete",
];

const PAYROLL_FULL: Capability[] = [
  "payroll:read",
  "payroll:create",
  "payroll:update",
  "payroll:delete",
];

const CUSTOMERS_FULL: Capability[] = [
  "customers:read",
  "customers:create",
  "customers:update",
  "customers:delete",
];

const SUPPLIERS_FULL: Capability[] = [
  "suppliers:read",
  "suppliers:create",
  "suppliers:update",
  "suppliers:delete",
];

const INVOICES_FULL: Capability[] = [
  "invoices:read",
  "invoices:create",
  "invoices:update",
  "invoices:delete",
  "invoices:approve",
];

const PAYMENTS_FULL: Capability[] = [
  "payments:read",
  "payments:create",
  "payments:update",
  "payments:delete",
];

const BANK_FULL: Capability[] = [
  "bank:read",
  "bank:create",
  "bank:update",
  "bank:delete",
];

const ADVANCES_FULL: Capability[] = [
  "advances:read",
  "advances:create",
  "advances:update",
  "advances:delete",
];

const CUSTODIES_FULL: Capability[] = [
  "custodies:read",
  "custodies:create",
  "custodies:update",
  "custodies:delete",
];

export const ROLE_CAPABILITIES: Record<RoleId, Capability[]> = {
  owner: [
    "team:manage",
    "company:manage",
    ...ACCOUNTS_FULL,
    ...TAXES_FULL,
    ...COST_CENTERS_FULL,
    ...CURRENCIES_FULL,
    ...JOURNAL_FULL,
    ...ASSETS_FULL,
    ...INVENTORY_FULL,
    ...PAYROLL_FULL,
    ...CUSTOMERS_FULL,
    ...SUPPLIERS_FULL,
    ...INVOICES_FULL,
    ...PAYMENTS_FULL,
    ...BANK_FULL,
    ...ADVANCES_FULL,
    ...CUSTODIES_FULL,
    "audit:read",
    "fiscalyear:read",
    "fiscalyear:manage",
  ],
  manager: [
    "company:manage",
    ...ACCOUNTS_FULL,
    ...TAXES_FULL,
    ...COST_CENTERS_FULL,
    ...CURRENCIES_FULL,
    ...JOURNAL_FULL,
    ...ASSETS_FULL,
    ...INVENTORY_FULL,
    ...PAYROLL_FULL,
    ...CUSTOMERS_FULL,
    ...SUPPLIERS_FULL,
    ...INVOICES_FULL,
    ...PAYMENTS_FULL,
    ...BANK_FULL,
    ...ADVANCES_FULL,
    ...CUSTODIES_FULL,
    "audit:read",
    "fiscalyear:read",
    "fiscalyear:manage",
  ],
  accountant: [
    "accounts:read",
    "accounts:create",
    "accounts:update",
    "taxes:read",
    "taxes:create",
    "taxes:update",
    "costCenters:read",
    "costCenters:create",
    "costCenters:update",
    "currencies:read",
    "currencies:create",
    "currencies:update",
    "journal:read",
    "journal:create",
    "journal:update",
    "journal:post",
    "journal:submit",
    "assets:read",
    "assets:create",
    "assets:update",
    "inventory:read",
    "inventory:create",
    "inventory:update",
    "payroll:read",
    "payroll:create",
    "payroll:update",
    "customers:read",
    "customers:create",
    "customers:update",
    "suppliers:read",
    "suppliers:create",
    "suppliers:update",
    "invoices:read",
    "invoices:create",
    "invoices:update",
    "invoices:approve",
    "payments:read",
    "payments:create",
    "payments:update",
    "bank:read",
    "bank:create",
    "bank:update",
    "advances:read",
    "advances:create",
    "advances:update",
    "custodies:read",
    "custodies:create",
    "custodies:update",
    "fiscalyear:read",
  ],
  data_entry: [
    "accounts:read",
    "accounts:create",
    "taxes:read",
    "costCenters:read",
    "costCenters:create",
    "currencies:read",
    "journal:read",
    "journal:create",
    "journal:submit",
    "assets:read",
    "assets:create",
    "inventory:read",
    "inventory:create",
    "payroll:read",
    "payroll:create",
    "customers:read",
    "customers:create",
    "suppliers:read",
    "suppliers:create",
    "invoices:read",
    "invoices:create",
    "payments:read",
    "payments:create",
    "bank:read",
    "bank:create",
    "advances:read",
    "advances:create",
    "custodies:read",
    "custodies:create",
    "fiscalyear:read",
  ],
  viewer: [
    "accounts:read",
    "taxes:read",
    "costCenters:read",
    "currencies:read",
    "journal:read",
    "assets:read",
    "inventory:read",
    "payroll:read",
    "customers:read",
    "suppliers:read",
    "invoices:read",
    "payments:read",
    "bank:read",
    "advances:read",
    "custodies:read",
    "fiscalyear:read",
  ],
};

export function isRole(value: string): value is RoleId {
  return (ROLES as readonly string[]).includes(value);
}

export function hasCapability(role: string, cap: Capability): boolean {
  if (!isRole(role)) return false;
  return ROLE_CAPABILITIES[role].includes(cap);
}

// Roles an owner can assign to invited members. "owner" is intentionally
// excluded — it is fixed to the company creator and cannot be granted via invite
// or role change, so a company always has exactly one owner.
export const ASSIGNABLE_ROLES: RoleId[] = [
  "manager",
  "accountant",
  "data_entry",
  "viewer",
];

export function isAssignableRole(value: string): value is RoleId {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}
