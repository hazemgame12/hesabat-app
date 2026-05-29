import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getStoredCredsMock } = vi.hoisted(() => ({
  getStoredCredsMock: vi.fn(),
}));

vi.mock("./store", () => ({
  getStoredCreds: getStoredCredsMock,
}));

import { getTokenExpiry, EXPIRY_WARNING_DAYS } from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  getStoredCredsMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-29T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getTokenExpiry", () => {
  it("returns unknown when no creds are stored", async () => {
    getStoredCredsMock.mockResolvedValue(null);
    expect(await getTokenExpiry("linkedin")).toEqual({
      expiresAt: null,
      status: "unknown",
    });
  });

  it("returns unknown when no tokenExpiresAt is present", async () => {
    getStoredCredsMock.mockResolvedValue({ accessToken: "x" });
    expect(await getTokenExpiry("facebook")).toEqual({
      expiresAt: null,
      status: "unknown",
    });
  });

  it("returns unknown for an unparseable timestamp", async () => {
    getStoredCredsMock.mockResolvedValue({ tokenExpiresAt: "not-a-date" });
    expect(await getTokenExpiry("linkedin")).toEqual({
      expiresAt: null,
      status: "unknown",
    });
  });

  it("flags an already-passed timestamp as expired", async () => {
    const past = new Date(Date.now() - DAY_MS).toISOString();
    getStoredCredsMock.mockResolvedValue({ tokenExpiresAt: past });
    expect(await getTokenExpiry("linkedin")).toEqual({
      expiresAt: past,
      status: "expired",
    });
  });

  it("flags a token within the warning window as expiring_soon", async () => {
    const soon = new Date(
      Date.now() + (EXPIRY_WARNING_DAYS - 1) * DAY_MS,
    ).toISOString();
    getStoredCredsMock.mockResolvedValue({ tokenExpiresAt: soon });
    expect(await getTokenExpiry("linkedin")).toEqual({
      expiresAt: soon,
      status: "expiring_soon",
    });
  });

  it("treats the exact warning boundary as expiring_soon", async () => {
    const boundary = new Date(
      Date.now() + EXPIRY_WARNING_DAYS * DAY_MS,
    ).toISOString();
    getStoredCredsMock.mockResolvedValue({ tokenExpiresAt: boundary });
    expect((await getTokenExpiry("linkedin")).status).toBe("expiring_soon");
  });

  it("flags a far-future timestamp as ok", async () => {
    const far = new Date(
      Date.now() + (EXPIRY_WARNING_DAYS + 30) * DAY_MS,
    ).toISOString();
    getStoredCredsMock.mockResolvedValue({ tokenExpiresAt: far });
    expect(await getTokenExpiry("linkedin")).toEqual({
      expiresAt: far,
      status: "ok",
    });
  });
});
