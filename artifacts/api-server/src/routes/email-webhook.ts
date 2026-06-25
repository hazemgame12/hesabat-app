import { Router } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, companiesTable, documentsTable } from "@workspace/db";
import { uploadsDir } from "./uploads";
import { safeAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router = Router();

const WEBHOOK_TOKEN = process.env.INBOUND_WEBHOOK_TOKEN ?? "";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME =
  /^(image\/(jpeg|jpg|png|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|application\/msword|text\/(csv|plain))$/;

interface PostmarkAttachment {
  Name: string;
  ContentType: string;
  ContentLength: number;
  Content: string;
}

interface PostmarkInbound {
  FromName?: string;
  From?: string;
  To?: string;
  Subject?: string;
  Attachments?: PostmarkAttachment[];
}

router.post("/webhook/email-inbound", async (req, res) => {
  const key = ((req.query as Record<string, string>).key) ?? "";
  if (!WEBHOOK_TOKEN || key !== WEBHOOK_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as PostmarkInbound;

  // Parse the To address local part (the inboxToken)
  const toRaw = (body.To ?? "").split(",")[0]?.trim() ?? "";
  // Handle "Name <token@domain>" format
  const toEmail = toRaw.includes("<") ? (toRaw.match(/<([^>]+)>/)?.[1] ?? toRaw) : toRaw;
  const localPart = toEmail.split("@")[0]?.toLowerCase() ?? "";

  if (!localPart) {
    res.status(400).json({ error: "No recipient" });
    return;
  }

  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.inboxToken, localPart))
    .limit(1);

  if (!company) {
    // Unknown token — respond 200 so Postmark does not retry
    res.json({ ok: true, skipped: true, reason: "unknown_token" });
    return;
  }

  const attachments = body.Attachments ?? [];
  if (attachments.length === 0) {
    res.json({ ok: true, saved: 0, skipped: 0 });
    return;
  }

  const totalBytes = attachments.reduce(
    (s, a) => s + (a.ContentLength ?? 0),
    0,
  );
  if (totalBytes > MAX_TOTAL_BYTES) {
    res.status(413).json({ error: "Attachments exceed 25 MB limit" });
    return;
  }

  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const att of attachments) {
    if (!ALLOWED_MIME.test(att.ContentType ?? "")) {
      skipped++;
      continue;
    }
    if ((att.ContentLength ?? 0) > MAX_ATTACHMENT_BYTES) {
      skipped++;
      continue;
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(att.Content, "base64");
    } catch {
      skipped++;
      continue;
    }

    // SHA-256 dedup — skip if already stored for this company
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    const [existing] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(eq(documentsTable.fileHash, hash))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }

    // Persist to disk
    const ext = path.extname(att.Name).toLowerCase() || ".bin";
    const filename = `email-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    try {
      fs.writeFileSync(filePath, buf);
    } catch (err) {
      logger.error({ err, file: att.Name }, "email-webhook: failed to write file");
      errors.push(att.Name);
      continue;
    }

    try {
      const [doc] = await db
        .insert(documentsTable)
        .values({
          companyId: company.id,
          displayName: att.Name,
          originalName: att.Name,
          filePath: filename,
          mimeType: att.ContentType,
          sizeBytes: buf.length,
          source: "email",
          senderName: body.FromName ?? null,
          senderEmail: body.From ?? null,
          emailSubject: body.Subject ?? null,
          fileHash: hash,
        })
        .returning({ id: documentsTable.id });

      await safeAudit(
        db,
        {
          companyId: company.id,
          userId: null,
          action: "create",
          entity: "document",
          entityId: doc?.id ?? null,
          entityLabel: att.Name,
          newValue: {
            source: "email",
            from: body.From,
            subject: body.Subject,
          },
        },
        logger,
      );

      saved++;
    } catch (err) {
      logger.error({ err, file: att.Name }, "email-webhook: failed to insert document");
      fs.unlink(filePath, () => {});
      errors.push(att.Name);
    }
  }

  res.json({ ok: true, saved, skipped, errors });
});

export default router;
