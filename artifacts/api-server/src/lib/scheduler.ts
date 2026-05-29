import { and, eq, lte, isNotNull } from "drizzle-orm";
import { db, articlesTable, socialPostsTable } from "@workspace/db";
import { logger } from "./logger";
import { attemptExternalPublish } from "./social/dispatch";

const POLL_INTERVAL_MS = Number(process.env["SCHEDULER_INTERVAL_MS"] || 60_000);

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Restart-safe scheduler. State lives entirely in the DB (status + scheduled_at),
 * so a process restart never loses or double-publishes work: each tick simply
 * acts on rows that are due "now".
 */
async function tick(): Promise<void> {
  if (running) return; // avoid overlap if a tick runs long
  running = true;
  const now = new Date();
  try {
    const publishedArticles = await db
      .update(articlesTable)
      .set({ status: "published", published: true, updatedAt: now })
      .where(
        and(
          eq(articlesTable.status, "scheduled"),
          isNotNull(articlesTable.scheduledAt),
          lte(articlesTable.scheduledAt, now),
        ),
      )
      .returning({ id: articlesTable.id });

    const releasedPosts = await db
      .update(socialPostsTable)
      .set({ status: "released", releasedAt: now, updatedAt: now })
      .where(
        and(
          eq(socialPostsTable.status, "scheduled"),
          isNotNull(socialPostsTable.scheduledAt),
          lte(socialPostsTable.scheduledAt, now),
        ),
      )
      .returning();

    // Dispatch each just-released post to its connected external platform and
    // record success/failure. Done sequentially to keep load predictable.
    let published = 0;
    let failed = 0;
    for (const post of releasedPosts) {
      const updated = await attemptExternalPublish(post);
      if (updated.publishResult === "published") published += 1;
      else failed += 1;
    }

    if (publishedArticles.length > 0 || releasedPosts.length > 0) {
      logger.info(
        {
          articles: publishedArticles.length,
          socialPosts: releasedPosts.length,
          socialPublished: published,
          socialFailed: failed,
        },
        "Scheduler released due content",
      );
    }
  } catch (err) {
    logger.error({ err }, "Scheduler tick failed");
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (timer) return;
  // Run once shortly after boot to catch anything already due, then on interval.
  void tick();
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Content scheduler started");
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
