import { describe, expect, it } from "vitest";
import { buildMovementLines, buildTransferLines } from "./bank-posting";

describe("bank posting builders", () => {
  it("applies movement dimensions to both generated journal lines", () => {
    const lines = buildMovementLines({
      direction: "out",
      bankChartAccountId: "bank",
      counterpartAccountId: "expense",
      amountBase: 100,
      description: "test",
      costCenterId: "cc",
      projectId: "project",
      branchId: "branch",
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      accountId: "bank",
      costCenterId: "cc",
      projectId: "project",
      branchId: "branch",
    });
    expect(lines[1]).toMatchObject({
      accountId: "expense",
      costCenterId: "cc",
      projectId: "project",
      branchId: "branch",
    });
  });

  it("applies transfer dimensions to all generated transfer lines", () => {
    const lines = buildTransferLines({
      srcBankChartAccountId: "src",
      destBankChartAccountId: "dest",
      srcAmountBase: 100,
      destAmountBase: 95,
      lossAccountId: "fx-loss",
      description: "transfer",
      costCenterId: "cc",
      projectId: "project",
      branchId: "branch",
    });

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toMatchObject({
        costCenterId: "cc",
        projectId: "project",
        branchId: "branch",
      });
    }
  });

  // ----- Debit/credit totals unchanged -----

  it("movement debit equals credit (balanced)", () => {
    const lines = buildMovementLines({
      direction: "in",
      bankChartAccountId: "bank",
      counterpartAccountId: "revenue",
      amountBase: 250,
      costCenterId: "cc",
      projectId: "proj",
      branchId: "br",
    });
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(250);
  });

  it("transfer debit equals credit (balanced, same-currency)", () => {
    const lines = buildTransferLines({
      srcBankChartAccountId: "src",
      destBankChartAccountId: "dest",
      srcAmountBase: 500,
      destAmountBase: 500,
      costCenterId: "cc",
      projectId: "proj",
      branchId: "br",
    });
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.005);
  });

  it("transfer debit equals credit (balanced, multi-currency with FX gain)", () => {
    const lines = buildTransferLines({
      srcBankChartAccountId: "src",
      destBankChartAccountId: "dest",
      srcAmountBase: 100,
      destAmountBase: 110,
      gainAccountId: "fx-gain",
      costCenterId: "cc",
      projectId: "proj",
      branchId: "br",
    });
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.005);
  });

  // ----- Null / missing dimensions -----

  it("movement without dimensions has null costCenterId/projectId/branchId", () => {
    const lines = buildMovementLines({
      direction: "out",
      bankChartAccountId: "bank",
      counterpartAccountId: "expense",
      amountBase: 75,
    });
    for (const line of lines) {
      expect(line.costCenterId).toBeNull();
      expect(line.projectId).toBeNull();
      expect(line.branchId).toBeNull();
    }
  });

  it("transfer without dimensions has null costCenterId/projectId/branchId", () => {
    const lines = buildTransferLines({
      srcBankChartAccountId: "src",
      destBankChartAccountId: "dest",
      srcAmountBase: 200,
      destAmountBase: 200,
    });
    for (const line of lines) {
      expect(line.costCenterId).toBeNull();
      expect(line.projectId).toBeNull();
      expect(line.branchId).toBeNull();
    }
  });

  it("movement without dimensions still has correct debit/credit amounts", () => {
    const lines = buildMovementLines({
      direction: "out",
      bankChartAccountId: "bank",
      counterpartAccountId: "expense",
      amountBase: 123.45,
    });
    // bank CR, expense DR
    expect(lines[0]).toMatchObject({ accountId: "bank", debit: 0, credit: 123.45 });
    expect(lines[1]).toMatchObject({ accountId: "expense", debit: 123.45, credit: 0 });
  });
});
