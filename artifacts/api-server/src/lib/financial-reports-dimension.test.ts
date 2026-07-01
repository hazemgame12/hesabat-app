import { describe, expect, expectTypeOf, it } from "vitest";
import {
  readReportDimensionFilters,
  type ReportDimensionFilters,
  validateDateRange,
} from "../routes/financial-reports";

describe("financial report dimension helpers", () => {
  it("accepts dimension filter ids in the shared type", () => {
    expectTypeOf<ReportDimensionFilters>().toEqualTypeOf<{
      costCenterId?: string | null;
      projectId?: string | null;
      branchId?: string | null;
      breakdownBy?: "costCenter" | "project" | "branch" | null;
    }>();
  });

  it("reads optional dimension filters from query params", () => {
    expect(
      readReportDimensionFilters({
        costCenterId: "cc-1",
        projectId: "",
        branchId: "br-1",
      }),
    ).toEqual({
      costCenterId: "cc-1",
      projectId: null,
      branchId: "br-1",
      breakdownBy: null,
    });
  });

  it("reads breakdownBy from query params", () => {
    expect(
      readReportDimensionFilters({ breakdownBy: "costCenter" }),
    ).toMatchObject({ breakdownBy: "costCenter" });
    expect(
      readReportDimensionFilters({ breakdownBy: "project" }),
    ).toMatchObject({ breakdownBy: "project" });
    expect(
      readReportDimensionFilters({ breakdownBy: "branch" }),
    ).toMatchObject({ breakdownBy: "branch" });
    expect(
      readReportDimensionFilters({ breakdownBy: "invalid" }),
    ).toMatchObject({ breakdownBy: null });
    expect(
      readReportDimensionFilters({}),
    ).toMatchObject({ breakdownBy: null });
  });

  it("validates date ranges without needing database access", () => {
    expect(validateDateRange("2024-01-01", "2024-01-31")).toBeNull();
    expect(validateDateRange("2024-02-01", "2024-01-31")).toBe(
      "تاريخ البداية يجب أن يكون قبل تاريخ النهاية",
    );
  });
});
