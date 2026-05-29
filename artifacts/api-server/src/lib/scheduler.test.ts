import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialPostRecord } from "@workspace/db";

// Chainable Drizzle stub shared by both update calls in a tick.
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
  articlesTable: { id: "article-id", status: "status", scheduledAt: "sa" },
  socialPostsTable: { id: "post-id", status: "status", scheduledAt: "sa" },
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./social/dispatch", () => ({
  attemptExternalPublish: vi.fn(),
}));

import { attemptExternalPublish } from "./social/dispatch";
import { startScheduler, stopScheduler } from "./scheduler";

const attemptExternalPublishMock = vi.mocked(attemptExternalPublish);

function makePost(overrides: Partial<SocialPostRecord> = {}): SocialPostRecord {
  return {
    id: 10,
    platform: "facebook",
    captionAr: "",
    captionEn: "",
    image: "",
    link: "",
    status: "released",
    scheduledAt: new Date("2026-01-01T00:00:00Z"),
    releasedAt: new Date("2026-01-02T00:00:00Z"),
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

beforeEach(() => {
  updateMock.mockClear();
  setMock.mockClear();
  whereMock.mockClear();
  returningMock.mockReset();
  attemptExternalPublishMock.mockReset();
});

afterEach(() => {
  stopScheduler();
});

describe("scheduler tick (via startScheduler)", () => {
  it("marks due articles published, due posts released, and dispatches each post", async () => {
    const releasedPosts = [
      makePost({ id: 1, platform: "facebook" }),
      makePost({ id: 2, platform: "linkedin" }),
    ];
    // First update call resolves articles, second resolves social posts.
    returningMock
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce(releasedPosts);
    attemptExternalPublishMock.mockImplementation(async (post) => ({
      ...post,
      publishResult: "published",
    }));

    startScheduler();

    await vi.waitFor(() =>
      expect(attemptExternalPublishMock).toHaveBeenCalledTimes(2),
    );

    // Both tables were updated.
    expect(updateMock).toHaveBeenCalledTimes(2);

    // The articles update sets a published status; the posts update sets released.
    const setPayloads = setMock.mock.calls.map(
      (c) => c[0] as Record<string, unknown>,
    );
    expect(setPayloads[0]?.["status"]).toBe("published");
    expect(setPayloads[0]?.["published"]).toBe(true);
    expect(setPayloads[1]?.["status"]).toBe("released");
    expect(setPayloads[1]?.["releasedAt"]).toBeInstanceOf(Date);

    // Each released post was dispatched.
    expect(attemptExternalPublishMock).toHaveBeenCalledWith(releasedPosts[0]);
    expect(attemptExternalPublishMock).toHaveBeenCalledWith(releasedPosts[1]);
  });

  it("does not dispatch anything when no posts are due", async () => {
    returningMock
      .mockResolvedValueOnce([]) // articles
      .mockResolvedValueOnce([]); // posts

    startScheduler();

    // Give the immediate tick a chance to run.
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(attemptExternalPublishMock).not.toHaveBeenCalled();
  });
});
