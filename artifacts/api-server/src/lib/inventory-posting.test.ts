import { describe, expect, it } from "vitest";
import { buildInventoryPostingLines, computeMovement, round2, round4 } from "./inventory-posting";

describe("inventory posting — line builder with dimensions", () => {
  it("receipt with dimensions stamps costCenterId/projectId/branchId on both lines", () => {
    const [invLine, counterLine] = buildInventoryPostingLines({
      inventoryAccountId: "inv-acct",
      counterpartAccountId: "supplier-acct",
      typeLabel: "استلام مخزون",
      itemLabel: "ITEM-001 · قلم",
      postAmount: 500,
      inventoryIsDebit: true,
      costCenterId: "cc-wh",
      projectId: "proj-x",
      branchId: "branch-cairo",
    });

    expect(invLine).toMatchObject({
      accountId: "inv-acct",
      debit: 500,
      credit: 0,
      costCenterId: "cc-wh",
      projectId: "proj-x",
      branchId: "branch-cairo",
    });
    expect(counterLine).toMatchObject({
      accountId: "supplier-acct",
      debit: 0,
      credit: 500,
      costCenterId: "cc-wh",
      projectId: "proj-x",
      branchId: "branch-cairo",
    });
  });

  it("issue with dimensions stamps dimensions and reverses debit/credit", () => {
    const [invLine, counterLine] = buildInventoryPostingLines({
      inventoryAccountId: "inv-acct",
      counterpartAccountId: "cogs-acct",
      typeLabel: "صرف مخزون",
      itemLabel: "ITEM-002 · ورق",
      postAmount: 300,
      inventoryIsDebit: false,
      costCenterId: "cc-sales",
      projectId: null,
      branchId: "branch-alex",
    });

    expect(invLine).toMatchObject({
      accountId: "inv-acct",
      debit: 0,
      credit: 300,
      costCenterId: "cc-sales",
      projectId: null,
      branchId: "branch-alex",
    });
    expect(counterLine).toMatchObject({
      accountId: "cogs-acct",
      debit: 300,
      credit: 0,
      costCenterId: "cc-sales",
      projectId: null,
      branchId: "branch-alex",
    });
  });

  it("inventory movement without dimensions has null dimensions on both lines", () => {
    const [invLine, counterLine] = buildInventoryPostingLines({
      inventoryAccountId: "inv-acct",
      counterpartAccountId: "cogs-acct",
      typeLabel: "صرف مخزون",
      itemLabel: "ITEM-003 · مسطرة",
      postAmount: 100,
      inventoryIsDebit: false,
    });

    for (const line of [invLine, counterLine]) {
      expect(line.costCenterId).toBeNull();
      expect(line.projectId).toBeNull();
      expect(line.branchId).toBeNull();
    }
  });

  it("inventory posting lines are balanced (debit === credit)", () => {
    const lines = buildInventoryPostingLines({
      inventoryAccountId: "inv-acct",
      counterpartAccountId: "expense-acct",
      typeLabel: "تسوية مخزون",
      itemLabel: "ITEM-004 · دباسة",
      postAmount: 750.50,
      inventoryIsDebit: true,
      costCenterId: "cc-1",
    });
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    expect(totalDebit).toBe(totalCredit);
  });

  it("debit/credit amounts are unchanged when dimensions are present", () => {
    const amount = 1234.56;
    const [invLine, counterLine] = buildInventoryPostingLines({
      inventoryAccountId: "inv-acct",
      counterpartAccountId: "cogs-acct",
      typeLabel: "صرف مخزون",
      itemLabel: "ITEM-005",
      postAmount: amount,
      inventoryIsDebit: false,
      costCenterId: "cc-a",
      projectId: "proj-b",
      branchId: "branch-c",
    });
    expect(invLine.debit + invLine.credit).toBe(amount);
    expect(counterLine.debit + counterLine.credit).toBe(amount);
  });
});

describe("inventory movement math (computeMovement) is not changed by dimension logic", () => {
  it("receipt blends weighted average correctly", () => {
    const result = computeMovement(10, 50, "receipt", 5, 60);
    expect(result).not.toBe("negative");
    if (result === "negative") return;
    expect(result.newQty).toBe(15);
    expect(result.newAvg).toBe(round4((10 * 50 + 5 * 60) / 15));
    expect(result.totalValue).toBe(round2(5 * 60));
    expect(result.inventoryIsDebit).toBe(true);
  });

  it("issue values at current average", () => {
    const result = computeMovement(20, 40, "issue", 8);
    expect(result).not.toBe("negative");
    if (result === "negative") return;
    expect(result.newQty).toBe(12);
    expect(result.totalValue).toBe(round2(8 * 40));
    expect(result.inventoryIsDebit).toBe(false);
  });
});
