import {
  GRAPH_BASE,
  composeMessage,
  getFacebookCreds,
  getInstagramCreds,
  getLinkedInCreds,
  toAbsoluteUrl,
  type LinkedInCreds,
  type SocialPlatform,
} from "./config";

export interface PublishablePost {
  platform: SocialPlatform;
  captionAr: string;
  captionEn: string;
  image: string;
  link: string;
}

export interface PublishResult {
  success: boolean;
  platformPostId: string;
  error: string;
}

export class PlatformNotConfiguredError extends Error {
  constructor(platform: SocialPlatform) {
    super(`Platform "${platform}" is not connected`);
    this.name = "PlatformNotConfiguredError";
  }
}

function ok(platformPostId: string): PublishResult {
  return { success: true, platformPostId, error: "" };
}

function fail(error: string): PublishResult {
  return { success: false, platformPostId: "", error };
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as unknown;
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      const err = obj["error"];
      if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        return String(e["message"] || e["error_user_msg"] || JSON.stringify(e));
      }
      if (typeof obj["message"] === "string") return obj["message"];
      return JSON.stringify(data);
    }
    return String(data);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

/* ─── Facebook Page feed ─────────────────────────────────────── */
async function publishToFacebook(post: PublishablePost): Promise<PublishResult> {
  const creds = await getFacebookCreds();
  if (!creds) throw new PlatformNotConfiguredError("facebook");

  const message = composeMessage(post);
  const imageUrl = toAbsoluteUrl(post.image);

  // With an image we post to /photos (the caption rides along); otherwise /feed.
  const endpoint = imageUrl
    ? `${GRAPH_BASE}/${creds.pageId}/photos`
    : `${GRAPH_BASE}/${creds.pageId}/feed`;

  const body = new URLSearchParams();
  body.set("access_token", creds.accessToken);
  if (imageUrl) {
    body.set("url", imageUrl);
    if (message) body.set("caption", message);
  } else {
    body.set("message", message);
  }

  const res = await fetch(endpoint, { method: "POST", body });
  if (!res.ok) return fail(await readError(res));
  const data = (await res.json()) as { id?: string; post_id?: string };
  return ok(String(data.post_id || data.id || ""));
}

/* ─── Instagram Business (2-step container publish) ──────────── */
async function publishToInstagram(post: PublishablePost): Promise<PublishResult> {
  const creds = await getInstagramCreds();
  if (!creds) throw new PlatformNotConfiguredError("instagram");

  const imageUrl = toAbsoluteUrl(post.image);
  if (!imageUrl) {
    return fail(
      "Instagram requires an image. Add an image to this post before publishing.",
    );
  }
  const caption = composeMessage(post);

  // Step 1: create a media container.
  const createBody = new URLSearchParams();
  createBody.set("access_token", creds.accessToken);
  createBody.set("image_url", imageUrl);
  if (caption) createBody.set("caption", caption);

  const createRes = await fetch(`${GRAPH_BASE}/${creds.igUserId}/media`, {
    method: "POST",
    body: createBody,
  });
  if (!createRes.ok) return fail(await readError(createRes));
  const created = (await createRes.json()) as { id?: string };
  const creationId = created.id;
  if (!creationId) return fail("Instagram did not return a media container id");

  // Step 2: publish the container.
  const publishBody = new URLSearchParams();
  publishBody.set("access_token", creds.accessToken);
  publishBody.set("creation_id", creationId);

  const publishRes = await fetch(`${GRAPH_BASE}/${creds.igUserId}/media_publish`, {
    method: "POST",
    body: publishBody,
  });
  if (!publishRes.ok) return fail(await readError(publishRes));
  const published = (await publishRes.json()) as { id?: string };
  return ok(String(published.id || creationId));
}

/**
 * Upload an image to LinkedIn and return its asset URN.
 * Flow: registerUpload → PUT the binary to the returned upload URL → asset URN.
 */
async function uploadLinkedInImage(
  creds: LinkedInCreds,
  imageUrl: string,
): Promise<string> {
  const registerRes = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: creds.authorUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    },
  );
  if (!registerRes.ok) {
    throw new Error(`LinkedIn registerUpload failed: ${await readError(registerRes)}`);
  }
  const register = (await registerRes.json()) as {
    value?: {
      asset?: string;
      uploadMechanism?: Record<string, { uploadUrl?: string }>;
    };
  };
  const asset = register.value?.asset;
  const uploadUrl =
    register.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  if (!asset || !uploadUrl) {
    throw new Error("LinkedIn registerUpload returned no upload URL");
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Could not fetch image for LinkedIn upload (${imgRes.status})`);
  }
  const bytes = Buffer.from(await imgRes.arrayBuffer());

  // LinkedIn's registered upload URL expects the raw image binary via PUT.
  const contentType =
    imgRes.headers.get("content-type") || "application/octet-stream";
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": contentType,
    },
    body: bytes,
  });
  if (!uploadRes.ok) {
    throw new Error(`LinkedIn media upload failed (${uploadRes.status})`);
  }
  return asset;
}

/* ─── LinkedIn organization/person share ─────────────────────── */
async function publishToLinkedIn(post: PublishablePost): Promise<PublishResult> {
  const creds = await getLinkedInCreds();
  if (!creds) throw new PlatformNotConfiguredError("linkedin");

  const text = composeMessage(post);
  const imageUrl = toAbsoluteUrl(post.image);

  // Attach the post image when present (register + upload + reference the asset).
  // An upload failure surfaces as a failed publish so it can be retried.
  let media: { status: string; media: string }[] | null = null;
  if (imageUrl) {
    const asset = await uploadLinkedInImage(creds, imageUrl);
    media = [{ status: "READY", media: asset }];
  }

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: media ? "IMAGE" : "NONE",
  };
  if (media) shareContent["media"] = media;

  const payload = {
    author: creds.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": shareContent,
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return fail(await readError(res));
  const id = res.headers.get("x-restli-id") || "";
  if (id) return ok(id);
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return ok(String(data.id || ""));
}

/**
 * Publish a post to its target platform's API. Throws
 * PlatformNotConfiguredError when the platform has no credentials configured.
 * Otherwise always resolves with a PublishResult (success or failure).
 */
export async function publishToPlatform(
  post: PublishablePost,
): Promise<PublishResult> {
  try {
    switch (post.platform) {
      case "facebook":
        return await publishToFacebook(post);
      case "instagram":
        return await publishToInstagram(post);
      case "linkedin":
        return await publishToLinkedIn(post);
      default:
        return fail(`Unknown platform: ${post.platform}`);
    }
  } catch (err) {
    if (err instanceof PlatformNotConfiguredError) throw err;
    return fail(err instanceof Error ? err.message : String(err));
  }
}
