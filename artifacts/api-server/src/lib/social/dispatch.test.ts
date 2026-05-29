import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialPostRecord } from "@workspace/db";

// Chainable Drizzle stub: db.update(table).set(...).where(...).returning()
// Declared via vi.hoisted so they exist when the hoisted vi.mock factory runs.
const { returningMock, whereMock, setMock, updateMock } = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
  const update = vi.fn((_table: unknown) => ({ set }));
  return {
    returningMock: returning,
    whereMock: where,
    setMock: set,
    updateMock: update,
  };
});

vi.mock("@workspace/db", () => ({
  db: { update: updateMock },
  socialPostsTable: { id: "id" },
}));

vi.mock("./config", () => ({
  isPlatformConfigured: vi.fn(),
}));

vi.mock("./publishers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./publishers")>();
  return {
    ...actual,
    publishToPlatform: vi.fn(),
  };
});

import { isPlatformConfigured } from "./config";
import {
  PlatformNotConfiguredError,
  publishToPlatform,
} from "./publishers";
import { attemptExternalPublish } from "./dispatch";

const isPlatformConfiguredMock = vi.mocked(isPlatformConfigured);
const publishToPlatformMock = vi.mocked(publishToPlatform);

function makePost(overrides: Partial<SocialPostRecord> = {}): SocialPostRecord {
  return {
    id: 1,
    platform: "facebook",
    captionAr: "نص",
    captionEn: "text",
    image: "https://cdn.example.com/p.jpg",
    link: "https://example.com/a",
    status: "released",
    scheduledAt: null,
    releasedAt: new Date("2026-01-01T00:00:00Z"),
    articleId: null,
    publishResult: null,
    publishError: "",
    platformPostId: "",
    publishedAt: null,
    publishAttempts: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Grab the object passed to `.set(...)` on the most recent call. */
function lastSetPayload(): Record<string, unknown> {
  const call = setMock.mock.calls.at(-1);
  if (!call) throw new Error("set() was never called");
  return call[0];
}

beforeEach(() => {
  updateMock.mockClear();
  setMock.mockClear();
  whereMock.mockClear();
  returningMock.mockReset();
  isPlatformConfiguredMock.mockReset();
  publishToPlatformMock.mockReset();
});

describe("attemptExternalPublish", () => {
  it("records a successful publish (published / id / cleared error / attempts+1)", async () => {
    const post = makePost({ publishAttempts: 2 });
    isPlatformConfiguredMock.mockResolvedValue(true);
    publishToPlatformMock.mockResolvedValue({
      success: true,
      platformPostId: "EXT_123",
      error: "",
    });
    const updatedRow = makePost({ publishResult: "published" });
    returningMock.mockResolvedValue([updatedRow]);

    const result = await attemptExternalPublish(post);

    expect(publishToPlatformMock).toHaveBeenCalledOnce();
    const payload = lastSetPayload();
    expect(payload["publishResult"]).toBe("published");
    expect(payload["publishError"]).toBe("");
    expect(payload["platformPostId"]).toBe("EXT_123");
    expect(payload["publishedAt"]).toBeInstanceOf(Date);
    expect(payload["publishAttempts"]).toBe(3);
    expect(result).toBe(updatedRow);
  });

  it("records an API failure (failed / error message / keeps prior id) and increments attempts", async () => {
    const post = makePost({
      publishAttempts: 1,
      platformPostId: "PREVIOUS",
      publishedAt: null,
    });
    isPlatformConfiguredMock.mockResolvedValue(true);
    publishToPlatformMock.mockResolvedValue({
      success: false,
      platformPostId: "",
      error: "Invalid OAuth access token",
    });
    returningMock.mockResolvedValue([makePost()]);

    await attemptExternalPublish(post);

    const payload = lastSetPayload();
    expect(payload["publishResult"]).toBe("failed");
    expect(payload["publishError"]).toBe("Invalid OAuth access token");
    expect(payload["platformPostId"]).toBe("PREVIOUS");
    expect(payload["publishedAt"]).toBeNull();
    expect(payload["publishAttempts"]).toBe(2);
  });

  it("records 'not connected' without calling the publisher when the platform is unconfigured", async () => {
    const post = makePost({ platform: "linkedin" });
    isPlatformConfiguredMock.mockResolvedValue(false);
    returningMock.mockResolvedValue([makePost({ platform: "linkedin" })]);

    await attemptExternalPublish(post);

    expect(publishToPlatformMock).not.toHaveBeenCalled();
    const payload = lastSetPayload();
    expect(payload["publishResult"]).toBe("failed");
    expect(payload["publishError"]).toContain("linkedin is not connected");
    expect(payload["publishAttempts"]).toBe(1);
  });

  it("treats a PlatformNotConfiguredError thrown mid-publish as 'not connected'", async () => {
    const post = makePost({ platform: "instagram" });
    isPlatformConfiguredMock.mockResolvedValue(true);
    publishToPlatformMock.mockRejectedValue(
      new PlatformNotConfiguredError("instagram"),
    );
    returningMock.mockResolvedValue([makePost({ platform: "instagram" })]);

    await attemptExternalPublish(post);

    const payload = lastSetPayload();
    expect(payload["publishResult"]).toBe("failed");
    expect(payload["publishError"]).toContain("instagram is not connected");
  });

  it("falls back to the input row when the update returns nothing", async () => {
    const post = makePost();
    isPlatformConfiguredMock.mockResolvedValue(true);
    publishToPlatformMock.mockResolvedValue({
      success: true,
      platformPostId: "X",
      error: "",
    });
    returningMock.mockResolvedValue([]);

    const result = await attemptExternalPublish(post);
    expect(result).toBe(post);
  });
});
