import { describe, expect, it } from "vitest";
import {
  addAmountToPostingDimensionBuckets,
  postingDimensionsKey,
  resolvePostingDimensions,
} from "./posting-dimensions";

describe("posting dimensions", () => {
  it("prefers line-level dimensions over header defaults", () => {
    expect(
      resolvePostingDimensions(
        {
          costCenterId: "line-cc",
          projectId: null,
          branchId: "line-branch",
        },
        {
          costCenterId: "header-cc",
          projectId: "header-project",
          branchId: "header-branch",
        },
      ),
    ).toEqual({
      costCenterId: "line-cc",
      projectId: "header-project",
      branchId: "line-branch",
    });
  });

  it("uses header dimensions when the line has none", () => {
    expect(
      resolvePostingDimensions(undefined, {
        costCenterId: "header-cc",
        projectId: "header-project",
        branchId: "header-branch",
      }),
    ).toEqual({
      costCenterId: "header-cc",
      projectId: "header-project",
      branchId: "header-branch",
    });
  });

  it("buckets amounts by effective dimension set", () => {
    const buckets = new Map();
    addAmountToPostingDimensionBuckets(
      buckets,
      10,
      { costCenterId: "line-cc" },
      { projectId: "header-project", branchId: "header-branch" },
    );
    addAmountToPostingDimensionBuckets(
      buckets,
      15,
      { costCenterId: "line-cc" },
      { projectId: "header-project", branchId: "header-branch" },
    );
    addAmountToPostingDimensionBuckets(
      buckets,
      5,
      undefined,
      { projectId: "header-project", branchId: "header-branch" },
    );

    expect(
      buckets.get(
        postingDimensionsKey({
          costCenterId: "line-cc",
          projectId: "header-project",
          branchId: "header-branch",
        }),
      ),
    ).toEqual({
      amount: 25,
      costCenterId: "line-cc",
      projectId: "header-project",
      branchId: "header-branch",
    });
    expect(
      buckets.get(
        postingDimensionsKey({
          costCenterId: null,
          projectId: "header-project",
          branchId: "header-branch",
        }),
      ),
    ).toEqual({
      amount: 5,
      costCenterId: null,
      projectId: "header-project",
      branchId: "header-branch",
    });
  });
});
