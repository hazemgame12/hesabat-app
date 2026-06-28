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
});
