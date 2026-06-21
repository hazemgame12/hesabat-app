import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db, siteSettingsTable } from "@workspace/db";
import { adminAuth } from "../middleware/auth";
import { getAIClient, AIConfigError } from "../lib/ai";

const router = Router();

const generateBodySchema = z.object({
  topic: z.string().min(2, "الموضوع مطلوب"),
  platforms: z
    .array(z.enum(["facebook", "instagram", "linkedin"]))
    .optional()
    .default(["facebook", "instagram", "linkedin"]),
});

const aiArticleSchema = z.object({
  slug: z.string().default(""),
  categoryAr: z.string().default(""),
  categoryEn: z.string().default(""),
  readTimeAr: z.string().default(""),
  readTimeEn: z.string().default(""),
  titleAr: z.string().default(""),
  titleEn: z.string().default(""),
  excerptAr: z.string().default(""),
  excerptEn: z.string().default(""),
  contentAr: z.string().default(""),
  contentEn: z.string().default(""),
});

const aiSocialSchema = z.object({
  platform: z.enum(["facebook", "instagram", "linkedin"]),
  captionAr: z.string().default(""),
  captionEn: z.string().default(""),
});

const aiResponseSchema = z.object({
  article: aiArticleSchema,
  social: z.array(aiSocialSchema).default([]),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function buildPrompt(topic: string, platforms: string[]): string {
  return `You are the senior content marketer for "HG Financial Consulting" (شركة اتش جي للاستشارات المالية), a professional firm in Egypt and Saudi Arabia offering financial auditing, tax consulting, company formation, accounting, feasibility studies, and financial digital transformation.

Write a high-quality, SEO-optimized, original article on this topic: "${topic}".

Requirements:
- Produce the article in BOTH Arabic (Egyptian professional tone) and English.
- The article body must be Markdown using ## and ### headings, bullet lists, and **bold** for emphasis (same style as an editorial blog post). 500-800 words each language.
- Be accurate and practical for business owners in Egypt/Saudi Arabia. End with a short paragraph about how HG can help.
- Also write short, engaging social media captions for these platforms: ${platforms.join(", ")}. Each caption in Arabic AND English, with relevant hashtags and a call to action. Keep Instagram/Facebook punchy; LinkedIn more professional.

Return ONLY a strict JSON object with EXACTLY this shape (no markdown fences, no commentary):
{
  "article": {
    "slug": "url-friendly-english-slug",
    "categoryAr": "التصنيف بالعربي",
    "categoryEn": "Category in English",
    "readTimeAr": "5 دقائق",
    "readTimeEn": "5 min read",
    "titleAr": "العنوان بالعربي",
    "titleEn": "Title in English",
    "excerptAr": "مقتطف قصير بالعربي",
    "excerptEn": "Short excerpt in English",
    "contentAr": "محتوى Markdown كامل بالعربي",
    "contentEn": "Full Markdown content in English"
  },
  "social": [
${platforms
  .map(
    (p) =>
      `    { "platform": "${p}", "captionAr": "النص بالعربي مع هاشتاجات", "captionEn": "Caption in English with hashtags" }`,
  )
  .join(",\n")}
  ]
}`;
}

router.post("/admin/ai/generate-content", adminAuth, async (req, res) => {
  const parsed = generateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { topic, platforms } = parsed.data;

  let client: ReturnType<typeof getAIClient>["client"];
  let model: string;
  try {
    const dbRow = await db
      .select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "gemini_api_key"));
    const dbKey = dbRow[0]?.value || undefined;
    ({ client, model } = getAIClient(dbKey));
  } catch (err) {
    if (err instanceof AIConfigError) {
      req.log.warn({ err }, "AI not configured");
      res.status(503).json({ error: err.message });
      return;
    }
    throw err;
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert bilingual (Arabic/English) financial content writer. You always respond with valid JSON only.",
        },
        { role: "user", content: buildPrompt(topic, platforms) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      res.status(502).json({
        error: "لم يرجع مزود الذكاء الاصطناعي أي محتوى. حاول مرة أخرى.",
      });
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      // Some models wrap JSON in code fences; strip and retry once.
      const cleaned = raw
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
      json = JSON.parse(cleaned);
    }

    const result = aiResponseSchema.parse(json);
    if (!result.article.slug) {
      result.article.slug = slugify(result.article.titleEn || topic);
    } else {
      result.article.slug = slugify(result.article.slug);
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "AI content generation failed");
    const message =
      err instanceof Error ? err.message : "AI content generation failed";
    res.status(502).json({
      error: `فشل توليد المحتوى بالذكاء الاصطناعي: ${message}`,
    });
  }
});

export default router;
