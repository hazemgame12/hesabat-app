import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, articlesTable, servicesTable, caseStudiesTable } from "@workspace/db";

const router = Router();

function getSiteUrl(req: import("express").Request): string {
  const envUrl = process.env["SITE_URL"];
  if (envUrl) return envUrl.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

router.get("/sitemap.xml", async (req, res) => {
  try {
    const base = getSiteUrl(req);
    const [articles, services, caseStudies] = await Promise.all([
      db.select({ slug: articlesTable.slug, updatedAt: articlesTable.updatedAt })
        .from(articlesTable).where(eq(articlesTable.published, true)),
      db.select({ id: servicesTable.id, updatedAt: servicesTable.updatedAt })
        .from(servicesTable).where(eq(servicesTable.published, true)).orderBy(asc(servicesTable.order)),
      db.select({ slug: caseStudiesTable.slug, updatedAt: caseStudiesTable.updatedAt })
        .from(caseStudiesTable).where(eq(caseStudiesTable.published, true)),
    ]);

    const staticPages = ["", "articles", "case-studies"];
    const serviceSlugs = [
      "financial-auditing", "tax-consulting", "company-formation",
      "accounting-services", "feasibility-studies", "financial-digital-transformation",
    ];

    const urls: string[] = [];
    const now = new Date().toISOString();

    for (const p of staticPages) {
      urls.push(`<url><loc>${base}/${p}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${p === "" ? "1.0" : "0.8"}</priority></url>`);
    }
    for (const slug of serviceSlugs) {
      urls.push(`<url><loc>${base}/services/${slug}</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
    }
    for (const a of articles) {
      urls.push(`<url><loc>${base}/articles/${a.slug}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    }
    for (const cs of caseStudies) {
      urls.push(`<url><loc>${base}/case-studies/${cs.slug}</loc><lastmod>${cs.updatedAt.toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
    }
    void services;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
    res.type("application/xml").send(xml);
  } catch (err) {
    req.log.error({ err }, "Failed to generate sitemap");
    res.status(500).send("Error");
  }
});

router.get("/robots.txt", (req, res) => {
  const base = getSiteUrl(req);
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\n\nSitemap: ${base}/sitemap.xml\n`);
});

export default router;
