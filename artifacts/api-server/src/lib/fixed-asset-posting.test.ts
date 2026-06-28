import { describe, expect, it } from "vitest";
import { buildDepreciationLines } from "./fixed-asset-posting";

describe("fixed asset depreciation — line builder with dimensions", () => {
  it("stamps costCenterId/projectId/branchId on both depreciation lines", () => {
    const [expLine, accLine] = buildDepreciationLines({
      expenseAccountId: "dep-exp-acct",
      accumulatedAccountId: "acc-dep-acct",
      label: "سيارة نقل",
      period: "2025-03",
      amount: 1500,
      costCenterId: "cc-fleet",
      projectId: "proj-infra",
      branchId: "branch-giza",
    });

    expect(expLine).toMatchObject({
      accountId: "dep-exp-acct",
      debit: 1500,
      credit: 0,
      costCenterId: "cc-fleet",
      projectId: "proj-infra",
      branchId: "branch-giza",
    });
    expect(accLine).toMatchObject({
      accountId: "acc-dep-acct",
      debit: 0,
      credit: 1500,
      costCenterId: "cc-fleet",
      projectId: "proj-infra",
      branchId: "branch-giza",
    });
  });

  it("depreciation without dimensions has null costCenterId/projectId/branchId", () => {
    const lines = buildDepreciationLines({
      expenseAccountId: "dep-exp-acct",
      accumulatedAccountId: "acc-dep-acct",
      label: "حاسوب",
      period: "2025-03",
      amount: 200,
    });
    for (const line of lines) {
      expect(line.costCenterId).toBeNull();
      expect(line.projectId).toBeNull();
      expect(line.branchId).toBeNull();
    }
  });

  it("depreciation lines are balanced (debit === credit)", () => {
    const [expLine, accLine] = buildDepreciationLines({
      expenseAccountId: "dep-exp-acct",
      accumulatedAccountId: "acc-dep-acct",
      label: "معدات",
      period: "2025-06",
      amount: 875.25,
      costCenterId: "cc-ops",
      projectId: null,
      branchId: "branch-main",
    });
    expect(expLine.debit).toBe(accLine.credit);
    expect(expLine.credit).toBe(0);
    expect(accLine.debit).toBe(0);
  });

  it("debit/credit amounts are unchanged when dimensions are present", () => {
    const amount = 3200.75;
    const [expLine, accLine] = buildDepreciationLines({
      expenseAccountId: "dep-exp-acct",
      accumulatedAccountId: "acc-dep-acct",
      label: "مولد كهربائي",
      period: "2025-01",
      amount,
      costCenterId: "cc-plant",
      projectId: "proj-expansion",
      branchId: "branch-delta",
    });
    expect(expLine.debit).toBe(amount);
    expect(accLine.credit).toBe(amount);
  });

  it("both lines carry identical dimensions", () => {
    const [expLine, accLine] = buildDepreciationLines({
      expenseAccountId: "dep-exp",
      accumulatedAccountId: "acc-dep",
      label: "طابعة",
      period: "2025-04",
      amount: 100,
      costCenterId: "cc-admin",
      projectId: "proj-hq",
      branchId: "branch-main",
    });
    expect(expLine.costCenterId).toBe(accLine.costCenterId);
    expect(expLine.projectId).toBe(accLine.projectId);
    expect(expLine.branchId).toBe(accLine.branchId);
  });

  it("generates correct description for depreciation expense line", () => {
    const [expLine] = buildDepreciationLines({
      expenseAccountId: "dep-exp",
      accumulatedAccountId: "acc-dep",
      label: "سيارة",
      period: "2025-05",
      amount: 600,
    });
    expect(expLine.description).toBe("إهلاك سيارة - 2025-05");
  });

  it("generates correct description for accumulated depreciation line", () => {
    const [, accLine] = buildDepreciationLines({
      expenseAccountId: "dep-exp",
      accumulatedAccountId: "acc-dep",
      label: "سيارة",
      period: "2025-05",
      amount: 600,
    });
    expect(accLine.description).toBe("مجمع إهلاك سيارة - 2025-05");
  });
});
