import { describe, expect, it } from "vitest";
import { pushPartyLines } from "./invoice-posting";
import {
  addAmountToPostingDimensionBuckets,
  resolvePostingDimensions,
} from "./posting-dimensions";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Helpers to simulate the invoice bucketing logic used in the route.
// ---------------------------------------------------------------------------

type Line = {
  lineTotal: number;
  taxAmount: number;
  whtAmount: number;
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
};

type HeaderDims = {
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
};

function simulateInvoicePosting(
  kind: "sales" | "purchase",
  lines: Line[],
  header: HeaderDims,
  rate = 1,
) {
  const partyAmounts = new Map<
    string,
    {
      amount: number;
      costCenterId: string | null;
      projectId: string | null;
      branchId: string | null;
    }
  >();
  const entryLines: {
    accountId: string;
    description: string | null;
    debit: number;
    credit: number;
    costCenterId?: string | null;
    projectId?: string | null;
    branchId?: string | null;
  }[] = [];

  for (const l of lines) {
    const lineTotalBase = round2(l.lineTotal * rate);
    const taxBase = round2(l.taxAmount * rate);
    const whtBase = round2(l.whtAmount * rate);
    const lineDimensions = resolvePostingDimensions(l, header);
    addAmountToPostingDimensionBuckets(
      partyAmounts,
      lineTotalBase + taxBase - whtBase,
      lineDimensions,
    );
    // Revenue/expense line
    entryLines.push({
      accountId: kind === "sales" ? "revenue" : "expense",
      description: "line",
      debit: kind === "sales" ? 0 : lineTotalBase,
      credit: kind === "sales" ? lineTotalBase : 0,
      ...lineDimensions,
    });
    // Tax line (mirrors real route)
    if (taxBase > 0) {
      entryLines.push({
        accountId: "tax",
        description: "tax",
        debit: kind === "sales" ? 0 : taxBase,
        credit: kind === "sales" ? taxBase : 0,
        ...lineDimensions,
      });
    }
    // WHT line (mirrors real route)
    if (whtBase > 0) {
      entryLines.push({
        accountId: "wht",
        description: "wht",
        debit: kind === "sales" ? whtBase : 0,
        credit: kind === "sales" ? 0 : whtBase,
        ...lineDimensions,
      });
    }
  }

  pushPartyLines(entryLines, {
    side: kind,
    accountId: kind === "sales" ? "ar" : "ap",
    description: `invoice - party`,
    amounts: partyAmounts,
  });

  return { entryLines, partyAmounts };
}

function totalDebit(
  lines: { debit: number }[],
): number {
  return round2(lines.reduce((s, l) => s + l.debit, 0));
}
function totalCredit(
  lines: { credit: number }[],
): number {
  return round2(lines.reduce((s, l) => s + l.credit, 0));
}

// ---------------------------------------------------------------------------
// Customer invoice (sales) with mixed line dimensions
// ---------------------------------------------------------------------------
describe("invoice posting — customer (sales)", () => {
  const header: HeaderDims = {
    costCenterId: "cc-header",
    projectId: "proj-header",
    branchId: "branch-header",
  };
  const lines: Line[] = [
    // Line 1: overrides costCenterId only
    {
      lineTotal: 100,
      taxAmount: 15,
      whtAmount: 0,
      costCenterId: "cc-line1",
      projectId: null,
      branchId: null,
    },
    // Line 2: overrides all dimensions
    {
      lineTotal: 200,
      taxAmount: 30,
      whtAmount: 5,
      costCenterId: "cc-line2",
      projectId: "proj-line2",
      branchId: "branch-line2",
    },
    // Line 3: no line dimensions — falls back to header
    {
      lineTotal: 50,
      taxAmount: 0,
      whtAmount: 0,
      costCenterId: null,
      projectId: null,
      branchId: null,
    },
  ];

  it("generates AR lines bucketed by effective dimension set", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, header);
    const arLines = entryLines.filter((l) => l.accountId === "ar");

    // Lines 1 & 3 resolve to different effective sets; line 2 resolves to its
    // own set — so we expect 3 distinct AR buckets.
    expect(arLines).toHaveLength(3);
  });

  it("total AR debit equals sum of (lineTotal + tax − wht) across all lines", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, header);
    const arLines = entryLines.filter((l) => l.accountId === "ar");
    const expectedTotal = round2(
      (100 + 15 - 0) + (200 + 30 - 5) + (50 + 0 - 0),
    );
    expect(totalDebit(arLines)).toBe(expectedTotal);
  });

  it("journal entry is balanced (total debit === total credit)", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, header);
    expect(totalDebit(entryLines)).toBe(totalCredit(entryLines));
  });

  it("revenue lines carry effective line-level dimensions", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, header);
    const revLines = entryLines.filter((l) => l.accountId === "revenue");
    // Line 1 overrides costCenterId, falls back to header for project & branch
    expect(revLines[0]).toMatchObject({
      costCenterId: "cc-line1",
      projectId: "proj-header",
      branchId: "branch-header",
    });
    // Line 2 overrides all
    expect(revLines[1]).toMatchObject({
      costCenterId: "cc-line2",
      projectId: "proj-line2",
      branchId: "branch-line2",
    });
    // Line 3 falls back entirely to header
    expect(revLines[2]).toMatchObject({
      costCenterId: "cc-header",
      projectId: "proj-header",
      branchId: "branch-header",
    });
  });

  it("AR lines carry the effective dimension of each bucket", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, header);
    const arLines = entryLines.filter((l) => l.accountId === "ar");
    const dimSets = arLines.map((l) =>
      `${l.costCenterId}|${l.projectId}|${l.branchId}`,
    );
    // All three AR buckets must have distinct effective dimension sets
    expect(new Set(dimSets).size).toBe(3);
  });

  it("AR lines are placed at the start of entryLines (sales convention)", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, header);
    // The first N lines must all be AR lines
    const arCount = entryLines.filter((l) => l.accountId === "ar").length;
    for (let i = 0; i < arCount; i++) {
      expect(entryLines[i]!.accountId).toBe("ar");
    }
  });
});

// ---------------------------------------------------------------------------
// Supplier invoice (purchase) with mixed line dimensions
// ---------------------------------------------------------------------------
describe("invoice posting — supplier (purchase)", () => {
  const header: HeaderDims = {
    costCenterId: "cc-hdr",
    projectId: null,
    branchId: "branch-hdr",
  };
  const lines: Line[] = [
    {
      lineTotal: 300,
      taxAmount: 45,
      whtAmount: 10,
      costCenterId: "cc-a",
      projectId: "proj-a",
      branchId: null,
    },
    {
      lineTotal: 100,
      taxAmount: 15,
      whtAmount: 0,
      costCenterId: "cc-a",
      projectId: "proj-a",
      branchId: null,
    },
    {
      lineTotal: 80,
      taxAmount: 0,
      whtAmount: 0,
      costCenterId: null,
      projectId: null,
      branchId: null,
    },
  ];

  it("lines with identical effective dims collapse into one AP bucket", () => {
    const { entryLines } = simulateInvoicePosting("purchase", lines, header);
    const apLines = entryLines.filter((l) => l.accountId === "ap");
    // Lines 1 & 2 share the same effective dims → 1 bucket; line 3 falls back
    // to header dims → 1 bucket → total 2 AP buckets
    expect(apLines).toHaveLength(2);
  });

  it("collapsed AP bucket amount equals the sum of its constituent line amounts", () => {
    const { entryLines } = simulateInvoicePosting("purchase", lines, header);
    const apLines = entryLines.filter((l) => l.accountId === "ap");
    // The cc-a bucket should hold lines 1+2: (300+45−10) + (100+15−0) = 450
    const expectedCollapsed = round2((300 + 45 - 10) + (100 + 15 - 0));
    const collapsedBucket = apLines.find((l) => l.costCenterId === "cc-a");
    expect(collapsedBucket).toBeDefined();
    expect(collapsedBucket!.credit).toBe(expectedCollapsed);
  });

  it("total AP credit equals sum of (lineTotal + tax − wht) across all lines", () => {
    const { entryLines } = simulateInvoicePosting("purchase", lines, header);
    const apLines = entryLines.filter((l) => l.accountId === "ap");
    const expectedTotal = round2(
      (300 + 45 - 10) + (100 + 15 - 0) + (80 + 0 - 0),
    );
    expect(totalCredit(apLines)).toBe(expectedTotal);
  });

  it("journal entry is balanced", () => {
    const { entryLines } = simulateInvoicePosting("purchase", lines, header);
    expect(totalDebit(entryLines)).toBe(totalCredit(entryLines));
  });

  it("AP lines are appended after revenue/expense lines (purchase convention)", () => {
    const { entryLines } = simulateInvoicePosting("purchase", lines, header);
    const lastApIdx = entryLines
      .map((l, i) => (l.accountId === "ap" ? i : -1))
      .filter((i) => i >= 0)
      .at(-1)!;
    const firstExpIdx = entryLines.findIndex((l) => l.accountId === "expense");
    expect(lastApIdx).toBeGreaterThan(firstExpIdx);
  });
});

// ---------------------------------------------------------------------------
// Invoice without dimensions — falls back to null
// ---------------------------------------------------------------------------
describe("invoice posting — no dimensions", () => {
  const emptyHeader: HeaderDims = {};
  const lines: Line[] = [
    { lineTotal: 120, taxAmount: 18, whtAmount: 0 },
    { lineTotal: 80, taxAmount: 0, whtAmount: 0 },
  ];

  it("resolves dimensions to null when none are provided", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, emptyHeader);
    for (const l of entryLines) {
      expect(l.costCenterId ?? null).toBeNull();
      expect(l.projectId ?? null).toBeNull();
      expect(l.branchId ?? null).toBeNull();
    }
  });

  it("all lines collapse into one AR bucket when all dims are null", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, emptyHeader);
    const arLines = entryLines.filter((l) => l.accountId === "ar");
    expect(arLines).toHaveLength(1);
  });

  it("journal entry is balanced", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, emptyHeader);
    expect(totalDebit(entryLines)).toBe(totalCredit(entryLines));
  });

  it("total AR debit is unchanged when no dims provided", () => {
    const { entryLines } = simulateInvoicePosting("sales", lines, emptyHeader);
    const arLines = entryLines.filter((l) => l.accountId === "ar");
    expect(totalDebit(arLines)).toBe(round2(120 + 18 + 80));
  });
});
