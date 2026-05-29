import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the pure helpers (composeMessage / toAbsoluteUrl / GRAPH_BASE) real, but
// stub the credential getters so we can drive "connected" vs "not connected".
vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return {
    ...actual,
    getFacebookCreds: vi.fn(),
    getInstagramCreds: vi.fn(),
    getLinkedInCreds: vi.fn(),
  };
});

import {
  getFacebookCreds,
  getInstagramCreds,
  getLinkedInCreds,
} from "./config";
import {
  PlatformNotConfiguredError,
  publishToPlatform,
  type PublishablePost,
} from "./publishers";

const getFacebookCredsMock = vi.mocked(getFacebookCreds);
const getInstagramCredsMock = vi.mocked(getInstagramCreds);
const getLinkedInCredsMock = vi.mocked(getLinkedInCreds);

type HeaderMap = Record<string, string>;

/** Minimal Response stand-in for JSON endpoints. */
function jsonResponse(
  body: unknown,
  init: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    headers?: HeaderMap;
  } = {},
): Response {
  const headers = new Map<string, string>(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
  } as unknown as Response;
}

/** Binary Response stand-in for image fetches / uploads. */
function binaryResponse(
  init: { ok?: boolean; status?: number; contentType?: string } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "OK",
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(8),
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-type"
          ? (init.contentType ?? "image/jpeg")
          : null,
    },
  } as unknown as Response;
}

const fetchMock = vi.fn();

const basePost: PublishablePost = {
  platform: "facebook",
  captionAr: "مرحبا",
  captionEn: "Hello",
  image: "https://cdn.example.com/pic.jpg",
  link: "https://example.com/article",
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getFacebookCredsMock.mockReset();
  getInstagramCredsMock.mockReset();
  getLinkedInCredsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishToPlatform — Facebook", () => {
  it("posts an image to /photos and returns the post id on success", async () => {
    getFacebookCredsMock.mockResolvedValue({
      pageId: "PAGE1",
      accessToken: "fb-token",
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "media1", post_id: "PAGE1_99" }),
    );

    const result = await publishToPlatform({ ...basePost, platform: "facebook" });

    expect(result.success).toBe(true);
    expect(result.platformPostId).toBe("PAGE1_99");
    expect(result.error).toBe("");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/PAGE1/photos");
    const body = options.body as URLSearchParams;
    expect(body.get("access_token")).toBe("fb-token");
    expect(body.get("url")).toBe("https://cdn.example.com/pic.jpg");
    expect(body.get("caption")).toContain("Hello");
  });

  it("returns a failure with the API error message on a non-ok response", async () => {
    getFacebookCredsMock.mockResolvedValue({
      pageId: "PAGE1",
      accessToken: "fb-token",
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { message: "Invalid OAuth access token" } },
        { ok: false, status: 400, statusText: "Bad Request" },
      ),
    );

    const result = await publishToPlatform({ ...basePost, platform: "facebook" });

    expect(result.success).toBe(false);
    expect(result.platformPostId).toBe("");
    expect(result.error).toBe("Invalid OAuth access token");
  });

  it("throws PlatformNotConfiguredError when Facebook is not connected", async () => {
    getFacebookCredsMock.mockResolvedValue(null);

    await expect(
      publishToPlatform({ ...basePost, platform: "facebook" }),
    ).rejects.toBeInstanceOf(PlatformNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("publishToPlatform — Instagram", () => {
  it("creates a media container then publishes it (2-step)", async () => {
    getInstagramCredsMock.mockResolvedValue({
      igUserId: "IG1",
      accessToken: "ig-token",
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "creation123" }))
      .mockResolvedValueOnce(jsonResponse({ id: "published456" }));

    const result = await publishToPlatform({ ...basePost, platform: "instagram" });

    expect(result.success).toBe(true);
    expect(result.platformPostId).toBe("published456");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain("/IG1/media");
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain(
      "/IG1/media_publish",
    );
    const publishBody = (fetchMock.mock.calls[1] as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(publishBody.get("creation_id")).toBe("creation123");
  });

  it("fails without calling the API when the post has no image", async () => {
    getInstagramCredsMock.mockResolvedValue({
      igUserId: "IG1",
      accessToken: "ig-token",
    });

    const result = await publishToPlatform({
      ...basePost,
      platform: "instagram",
      image: "",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Instagram requires an image");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a failure when the container creation errors", async () => {
    getInstagramCredsMock.mockResolvedValue({
      igUserId: "IG1",
      accessToken: "ig-token",
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { message: "Media error" } },
        { ok: false, status: 400 },
      ),
    );

    const result = await publishToPlatform({ ...basePost, platform: "instagram" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Media error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("publishToPlatform — LinkedIn", () => {
  it("publishes text-only when there is no image, returning the restli id", async () => {
    getLinkedInCredsMock.mockResolvedValue({
      accessToken: "li-token",
      authorUrn: "urn:li:person:abc",
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({}, { headers: { "x-restli-id": "urn:li:share:1" } }),
    );

    const result = await publishToPlatform({
      ...basePost,
      platform: "linkedin",
      image: "",
    });

    expect(result.success).toBe(true);
    expect(result.platformPostId).toBe("urn:li:share:1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v2/ugcPosts");
    const payload = JSON.parse(options.body as string) as {
      specificContent: {
        "com.linkedin.ugc.ShareContent": { shareMediaCategory: string };
      };
    };
    expect(
      payload.specificContent["com.linkedin.ugc.ShareContent"]
        .shareMediaCategory,
    ).toBe("NONE");
  });

  it("uploads the image (register → fetch → PUT) then shares it", async () => {
    getLinkedInCredsMock.mockResolvedValue({
      accessToken: "li-token",
      authorUrn: "urn:li:person:abc",
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: {
            asset: "urn:li:digitalmediaAsset:xyz",
            uploadMechanism: {
              "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                uploadUrl: "https://upload.linkedin.com/put",
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(binaryResponse({ contentType: "image/png" }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 201 }))
      .mockResolvedValueOnce(
        jsonResponse({}, { headers: { "x-restli-id": "urn:li:share:2" } }),
      );

    const result = await publishToPlatform({ ...basePost, platform: "linkedin" });

    expect(result.success).toBe(true);
    expect(result.platformPostId).toBe("urn:li:share:2");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain(
      "registerUpload",
    );
    const sharePayload = JSON.parse(
      (fetchMock.mock.calls[3] as [string, RequestInit])[1].body as string,
    ) as {
      specificContent: {
        "com.linkedin.ugc.ShareContent": { shareMediaCategory: string };
      };
    };
    expect(
      sharePayload.specificContent["com.linkedin.ugc.ShareContent"]
        .shareMediaCategory,
    ).toBe("IMAGE");
  });

  it("returns a failure when the share endpoint errors", async () => {
    getLinkedInCredsMock.mockResolvedValue({
      accessToken: "li-token",
      authorUrn: "urn:li:person:abc",
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { message: "Token expired" },
        { ok: false, status: 401, statusText: "Unauthorized" },
      ),
    );

    const result = await publishToPlatform({
      ...basePost,
      platform: "linkedin",
      image: "",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Token expired");
  });

  it("throws PlatformNotConfiguredError when LinkedIn is not connected", async () => {
    getLinkedInCredsMock.mockResolvedValue(null);

    await expect(
      publishToPlatform({ ...basePost, platform: "linkedin" }),
    ).rejects.toBeInstanceOf(PlatformNotConfiguredError);
  });
});

describe("publishToPlatform — unknown platform", () => {
  it("returns a failure for an unrecognised platform", async () => {
    const result = await publishToPlatform({
      ...basePost,
      platform: "tiktok" as never,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown platform");
  });
});
