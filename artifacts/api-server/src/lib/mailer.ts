import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env["SMTP_HOST"];
  const port = process.env["SMTP_PORT"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!host || !port || !user || !pass) {
    return null;
  }
  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return cachedTransporter;
}

export async function sendLeadNotification(lead: {
  name: string;
  phone: string;
  email: string;
  message: string;
  service?: string;
}): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn("SMTP not configured — skipping email notification");
    return false;
  }
  const to = process.env["LEAD_NOTIFICATION_TO"] ?? process.env["SMTP_USER"];
  const from = process.env["SMTP_FROM"] ?? process.env["SMTP_USER"];
  if (!to || !from) return false;

  const subject = `طلب جديد من الموقع - ${lead.name}`;
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #001d56; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">طلب تواصل جديد</h2>
        <p style="margin: 5px 0 0; opacity: 0.8;">HG Financial Consulting</p>
      </div>
      <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold; width: 100px;">الاسم:</td><td>${escapeHtml(lead.name)}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">الهاتف:</td><td dir="ltr">${escapeHtml(lead.phone)}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">الإيميل:</td><td dir="ltr">${escapeHtml(lead.email || "-")}</td></tr>
          ${lead.service ? `<tr><td style="padding: 8px 0; font-weight: bold;">الخدمة:</td><td>${escapeHtml(lead.service)}</td></tr>` : ""}
        </table>
        ${lead.message ? `<div style="margin-top: 15px; padding: 15px; background: white; border-radius: 6px; border-right: 4px solid #0571d5;"><strong>الرسالة:</strong><br>${escapeHtml(lead.message).replace(/\n/g, "<br>")}</div>` : ""}
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({ from, to, subject, html, replyTo: lead.email || undefined });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send lead email");
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
