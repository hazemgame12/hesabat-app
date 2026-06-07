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
  ],
  manager: [
    "company:manage",
    ...ACCOUNTS_FULL,
    ...TAXES_FULL,
    ...COST_CENTERS_FULL,
    ...CURRENCIES_FULL,
    ...JOURNAL_FULL,
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
  ],
  viewer: [
    "accounts:read",
    "taxes:read",
    "costCenters:read",
    "currencies:read",
    "journal:read",
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
