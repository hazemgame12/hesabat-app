import { eq } from "drizzle-orm";
import { db, socialPostsTable, type SocialPostRecord } from "@workspace/db";
import {
  PlatformNotConfiguredError,
  publishToPlatform,
} from "./publishers";
import { isPlatformConfigured, type SocialPlatform } from "./config";

/**
 * Attempt to publish a single post to its external platform and persist the
 * outcome (publishResult / publishError / platformPostId / publishedAt /
 * publishAttempts). Never throws — returns the updated row.
 *
 * When the platform isn't connected, the post is recorded as failed with a
 * clear message so the dashboard can surface it and offer a retry once the
 * admin connects the platform.
 */
export async function attemptExternalPublish(
  post: SocialPostRecord,
): Promise<SocialPostRecord> {
  const now = new Date();
  const platform = post.platform as SocialPlatform;

  let success = false;
  let platformPostId = "";
  let error = "";

  if (!(await isPlatformConfigured(platform))) {
    error = `${platform} is not connected. Connect it from the dashboard.`;
  } else {
    try {
      const result = await publishToPlatform({
        platform,
        captionAr: post.captionAr,
        captionEn: post.captionEn,
        image: post.image,
        link: post.link,
      });
      success = result.success;
      platformPostId = result.platformPostId;
      error = result.error;
    } catch (err) {
      if (err instanceof PlatformNotConfiguredError) {
        error = `${platform} is not connected. Connect it from the dashboard.`;
      } else {
        error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const [row] = await db
    .update(socialPostsTable)
    .set({
      publishResult: success ? "published" : "failed",
      publishError: success ? "" : error,
      platformPostId: success ? platformPostId : post.platformPostId,
      publishedAt: success ? now : post.publishedAt,
      publishAttempts: post.publishAttempts + 1,
      updatedAt: now,
    })
    .where(eq(socialPostsTable.id, post.id))
    .returning();

  return row ?? post;
}
