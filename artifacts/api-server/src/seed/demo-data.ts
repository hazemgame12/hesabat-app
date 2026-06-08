/**
 * Demo data seed for Hesabat. Creates three companies in different countries
 * (Egypt / Saudi Arabia / UAE) with a full bilingual chart of accounts, the
 * country tax templates, customers, suppliers, and POSTED transactions that
 * exercise each country's VAT — so the financial reports and dashboard are
 * populated and taxes can be compared across countries.
 *
 * Idempotent: a company is identified by its owner email; if that user already
 * exists the company is skipped (re-run safe).
 *
 * Run with: pnpm --filter @workspace/api-server run seed:demo
 */
import { eq } from "drizzle-orm";
import {
  db,
  companiesTable,
  usersTable,
  taxesTable,
  accountsTable,
  customersTable,
  suppliersTable,
  invoicesTable,
  invoiceLinesTable,
} from "@workspace/db";
import { hashPassword } from "../lib/auth";
import { seedDefaultAccounts } from "../lib/seed-accounts";
import { seedDefaultTaxes } from "../lib/seed-taxes";
import { createDraftJournalEntry } from "../lib/journal-posting";
import { generateChildAccountCode } from "../lib/party-ledger";
import { logger } from "../lib/logger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const round2 = (n: number) => Math.round(n * 100) / 100;

const DEMO_PASSWORD = "Demo@12345";

type PartyConfig = {
  code: string;
  nameAr: string;
  nameEn: string;
  taxNumber?: string;
};

type CompanyConfig = {
  name: string;
  tradeName: string;
  country: string;
  baseCurrency: string;
  activityDescription: string;
  taxRegistrationNumber: string;
  owner: { name: string; email: string };
  capital: number; // opening capital injected to the main bank account
  rent: number; // monthly rent paid from the bank
  customers: PartyConfig[];
  suppliers: PartyConfig[];
  // Net (pre-tax) amounts for the demo sales / purchase service invoices.
  salesAmounts: number[];
  purchaseAmounts: number[];
};

const COMPANIES: CompanyConfig[] = [
  {
    name: "شركة النيل للتجارة والتوزيع",
    tradeName: "النيل تريد",
    country: "EG",
    baseCurrency: "EGP",
    activityDescription: "تجارة وتوزيع المنتجات الغذائية",
    taxRegistrationNumber: "100-200-300",
    owner: { name: "أحمد محمود", email: "demo-eg@hesabat.app" },
    capital: 500000,
    rent: 18000,
    customers: [
      { code: "C001", nameAr: "سوبر ماركet الأمل", nameEn: "Al Amal Market", taxNumber: "201-300-400" },
      { code: "C002", nameAr: "مؤسسة الشروق التجارية", nameEn: "Al Shorouk Trading" },
    ],
    suppliers: [
      { code: "S001", nameAr: "مصنع الدلتا للأغذية", nameEn: "Delta Foods Factory", taxNumber: "305-410-520" },
      { code: "S002", nameAr: "شركة المراعي للتوريدات", nameEn: "Al Maraei Supplies" },
    ],
    salesAmounts: [85000, 42000, 67000],
    purchaseAmounts: [55000, 31000],
  },
  {
    name: "مؤسسة الواحة للمقاولات",
    tradeName: "الواحة",
    country: "SA",
    baseCurrency: "SAR",
    activityDescription: "مقاولات وخدمات إنشائية",
    taxRegistrationNumber: "310445566700003",
    owner: { name: "خالد العتيبي", email: "demo-sa@hesabat.app" },
    capital: 800000,
    rent: 25000,
    customers: [
      { code: "C001", nameAr: "شركة المستقبل العقارية", nameEn: "Future Real Estate", taxNumber: "300112233400003" },
      { code: "C002", nameAr: "مجموعة الرياض للتطوير", nameEn: "Riyadh Development Group" },
    ],
    suppliers: [
      { code: "S001", nameAr: "مصنع الإسمنت الوطني", nameEn: "National Cement Factory", taxNumber: "300998877600003" },
      { code: "S002", nameAr: "شركة الحديد والصلب", nameEn: "Steel & Iron Co." },
    ],
    salesAmounts: [120000, 95000, 60000],
    purchaseAmounts: [70000, 48000],
  },
  {
    name: "شركة الخليج للاستشارات",
    tradeName: "الخليج كونسلت",
    country: "AE",
    baseCurrency: "AED",
    activityDescription: "استشارات إدارية وتقنية",
    taxRegistrationNumber: "100123456700003",
    owner: { name: "سيف المنصوري", email: "demo-ae@hesabat.app" },
    capital: 600000,
    rent: 30000,
    customers: [
      { code: "C001", nameAr: "بنك الإمارات الأول", nameEn: "First Emirates Bank", taxNumber: "100223344500003" },
      { code: "C002", nameAr: "شركة دبي للتكنولوجيا", nameEn: "Dubai Tech Co." },
    ],
    suppliers: [
      { code: "S001", nameAr: "مزود الخدمات السحابية", nameEn: "Cloud Services Provider", taxNumber: "100556677800003" },
      { code: "S002", nameAr: "مكتب التوظيف المحترف", nameEn: "Pro Recruitment Office" },
    ],
    salesAmounts: [150000, 88000, 72000],
    purchaseAmounts: [45000, 33000],
  },
];

// Creates a party (customer or supplier) with a dedicated subsidiary leaf
// account under its control account, mirroring the live route logic.
async function createParty(
  tx: Tx,
  companyId: string,
  kind: "customer" | "supplier",
  cfg: PartyConfig,
  controlAccountId: string,
  controlCode: string,
  type: "asset" | "liability",
): Promise<{ id: string; accountId: string; nameAr: string }> {
  const childCode = await generateChildAccountCode(
    tx,
    companyId,
    controlAccountId,
    controlCode,
  );
  const [account] = await tx
    .insert(accountsTable)
    .values({
      companyId,
      code: childCode,
      nameAr: cfg.nameAr,
      nameEn: cfg.nameEn,
      type,
      parentId: controlAccountId,
      isGroup: false,
    })
    .returning();
  const table = kind === "customer" ? customersTable : suppliersTable;
  const [party] = await tx
    .insert(table)
    .values({
      companyId,
      code: cfg.code,
      nameAr: cfg.nameAr,
      nameEn: cfg.nameEn,
      type: "company",
      taxNumber: cfg.taxNumber ?? null,
      controlAccountId,
      accountId: account!.id,
      isActive: true,
    })
    .returning();
  return { id: party!.id, accountId: account!.id, nameAr: cfg.nameAr };
}

// Posts an approved service invoice (single line) and its journal entry,
// mirroring the invoice-approval posting for `lineType: "service"`.
async function postServiceInvoice(
  tx: Tx,
  opts: {
    companyId: string;
    baseCurrency: string;
    kind: "sales" | "purchase";
    invoiceNo: number;
    date: string;
    dueDate: string;
    party: { id: string; accountId: string; nameAr: string };
    counterpartAccountId: string; // revenue (sales) or expense (purchase)
    taxId: string;
    taxAccountId: string;
    taxRate: number;
    net: number;
    description: string;
    createdBy: string;
  },
): Promise<void> {
  const lineTotal = round2(opts.net);
  const taxAmount = round2((lineTotal * opts.taxRate) / 100);
  const total = round2(lineTotal + taxAmount);

  const [inv] = await tx
    .insert(invoicesTable)
    .values({
      companyId: opts.companyId,
      kind: opts.kind,
      invoiceNo: opts.invoiceNo,
      date: opts.date,
      dueDate: opts.dueDate,
      customerId: opts.kind === "sales" ? opts.party.id : null,
      supplierId: opts.kind === "purchase" ? opts.party.id : null,
      currency: null,
      exchangeRate: "1",
      status: "approved",
      subtotal: String(lineTotal),
      discountTotal: "0",
      taxTotal: String(taxAmount),
      total: String(total),
      amountPaid: "0",
      createdBy: opts.createdBy,
      approvedAt: new Date(),
    })
    .returning();

  await tx.insert(invoiceLinesTable).values({
    invoiceId: inv!.id,
    companyId: opts.companyId,
    lineNo: 1,
    lineType: "service",
    description: opts.description,
    accountId: opts.counterpartAccountId,
    quantity: "1",
    unitPrice: String(lineTotal),
    discount: "0",
    taxId: opts.taxId,
    taxAmount: String(taxAmount),
    lineTotal: String(lineTotal),
  });

  const lines: {
    accountId: string;
    description?: string | null;
    debit: number;
    credit: number;
  }[] = [];
  if (opts.kind === "sales") {
    lines.push({
      accountId: opts.party.accountId,
      description: `فاتورة مبيعات #${opts.invoiceNo} - ${opts.party.nameAr}`,
      debit: total,
      credit: 0,
    });
    lines.push({ accountId: opts.counterpartAccountId, debit: 0, credit: lineTotal });
    if (taxAmount > 0)
      lines.push({ accountId: opts.taxAccountId, debit: 0, credit: taxAmount });
  } else {
    lines.push({ accountId: opts.counterpartAccountId, debit: lineTotal, credit: 0 });
    if (taxAmount > 0)
      lines.push({ accountId: opts.taxAccountId, debit: taxAmount, credit: 0 });
    lines.push({
      accountId: opts.party.accountId,
      description: `فاتورة مشتريات #${opts.invoiceNo} - ${opts.party.nameAr}`,
      debit: 0,
      credit: total,
    });
  }

  const entry = await createDraftJournalEntry(tx, {
    companyId: opts.companyId,
    baseCurrency: opts.baseCurrency,
    date: opts.date,
    reference: `${opts.kind === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات"} #${opts.invoiceNo}`,
    createdBy: opts.createdBy,
    status: "posted",
    lines,
  });

  await tx
    .update(invoicesTable)
    .set({ journalEntryId: entry.id })
    .where(eq(invoicesTable.id, inv!.id));
}

async function seedCompany(cfg: CompanyConfig): Promise<"created" | "skipped"> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, cfg.owner.email))
    .limit(1);
  if (existing) return "skipped";

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const year = new Date().getUTCFullYear();

  await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companiesTable)
      .values({
        name: cfg.name,
        tradeName: cfg.tradeName,
        activityDescription: cfg.activityDescription,
        taxRegistrationNumber: cfg.taxRegistrationNumber,
        country: cfg.country,
        baseCurrency: cfg.baseCurrency,
      })
      .returning();
    const companyId = company!.id;

    const [owner] = await tx
      .insert(usersTable)
      .values({
        companyId,
        email: cfg.owner.email,
        name: cfg.owner.name,
        passwordHash,
        role: "owner",
      })
      .returning();
    const createdBy = owner!.id;

    const codeToId = await seedDefaultAccounts(tx, companyId);
    await seedDefaultTaxes(tx, companyId, cfg.country, codeToId);

    // Resolve the VAT tax for this company (every seeded country has one).
    const taxes = await tx
      .select({
        id: taxesTable.id,
        kind: taxesTable.kind,
        rate: taxesTable.rate,
        linkedAccountId: taxesTable.linkedAccountId,
      })
      .from(taxesTable)
      .where(eq(taxesTable.companyId, companyId));
    const vat = taxes.find((t) => t.kind === "vat");
    if (!vat || !vat.linkedAccountId) {
      throw new Error(`No VAT tax seeded for ${cfg.country}`);
    }
    const vatRate = Number(vat.rate);

    const bankId = codeToId.get("1112")!; // National-bank style cash account
    const capitalId = codeToId.get("311")!;
    const rentId = codeToId.get("512")!;
    const revenueId = codeToId.get("411")!;
    const expenseId = codeToId.get("513")!; // operating expenses (purchases)
    const customerControlId = codeToId.get("112")!;
    const supplierControlId = codeToId.get("211")!;

    // Opening capital: Dr Bank / Cr Capital.
    await createDraftJournalEntry(tx, {
      companyId,
      baseCurrency: cfg.baseCurrency,
      date: `${year}-01-01`,
      reference: "رأس المال الافتتاحي",
      createdBy,
      status: "posted",
      lines: [
        { accountId: bankId, debit: cfg.capital, credit: 0, description: "إيداع رأس المال" },
        { accountId: capitalId, debit: 0, credit: cfg.capital, description: "رأس المال" },
      ],
    });

    // Rent paid from the bank: Dr Rent / Cr Bank.
    await createDraftJournalEntry(tx, {
      companyId,
      baseCurrency: cfg.baseCurrency,
      date: `${year}-02-05`,
      reference: "إيجار المقر",
      createdBy,
      status: "posted",
      lines: [
        { accountId: rentId, debit: cfg.rent, credit: 0, description: "إيجار شهري" },
        { accountId: bankId, debit: 0, credit: cfg.rent, description: "سداد الإيجار" },
      ],
    });

    const customers = [];
    for (const c of cfg.customers) {
      customers.push(
        await createParty(tx, companyId, "customer", c, customerControlId, "112", "asset"),
      );
    }
    const suppliers = [];
    for (const s of cfg.suppliers) {
      suppliers.push(
        await createParty(tx, companyId, "supplier", s, supplierControlId, "211", "liability"),
      );
    }

    // Sales invoices.
    let salesNo = 1;
    for (let i = 0; i < cfg.salesAmounts.length; i++) {
      const party = customers[i % customers.length]!;
      const month = String(3 + i).padStart(2, "0");
      await postServiceInvoice(tx, {
        companyId,
        baseCurrency: cfg.baseCurrency,
        kind: "sales",
        invoiceNo: salesNo++,
        date: `${year}-${month}-10`,
        dueDate: `${year}-${month}-25`,
        party,
        counterpartAccountId: revenueId,
        taxId: vat.id,
        taxAccountId: vat.linkedAccountId,
        taxRate: vatRate,
        net: cfg.salesAmounts[i]!,
        description: "خدمات مقدمة للعميل",
        createdBy,
      });
    }

    // Purchase invoices.
    let purchaseNo = 1;
    for (let i = 0; i < cfg.purchaseAmounts.length; i++) {
      const party = suppliers[i % suppliers.length]!;
      const month = String(3 + i).padStart(2, "0");
      await postServiceInvoice(tx, {
        companyId,
        baseCurrency: cfg.baseCurrency,
        kind: "purchase",
        invoiceNo: purchaseNo++,
        date: `${year}-${month}-15`,
        dueDate: `${year}-${month}-30`,
        party,
        counterpartAccountId: expenseId,
        taxId: vat.id,
        taxAccountId: vat.linkedAccountId,
        taxRate: vatRate,
        net: cfg.purchaseAmounts[i]!,
        description: "مشتريات وخدمات تشغيلية",
        createdBy,
      });
    }
  });

  return "created";
}

async function main() {
  logger.info("Seeding Hesabat demo data (EG / SA / AE)...");
  for (const cfg of COMPANIES) {
    const result = await seedCompany(cfg);
    logger.info(
      { country: cfg.country, email: cfg.owner.email, result },
      `Company ${cfg.name}: ${result}`,
    );
  }
  logger.info("Demo seed complete.");
  await db.$client.end();
}

main().catch((err) => {
  logger.error({ err }, "Demo seed failed");
  process.exitCode = 1;
});
