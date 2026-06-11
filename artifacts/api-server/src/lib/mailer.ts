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

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn("SMTP not configured — skipping password reset email");
    return false;
  }
  const from = process.env["SMTP_FROM"] ?? process.env["SMTP_USER"];
  if (!from) return false;

  const baseUrl = process.env["APP_BASE_URL"] ?? "https://app.hg-audit.com";
  const resetLink = `${baseUrl}/reset-password?token=${token}`;

  const subject = "استعادة كلمة المرور — حسابات";
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #001d56; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">استعادة كلمة المرور</h2>
        <p style="margin: 5px 0 0; opacity: 0.8;">حسابات</p>
      </div>
      <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px;">
        <p>مرحباً ${escapeHtml(name)}</p>
        <p>لقد تلقينا طلباً لاستعادة كلمة المرور الخاصة بك. اضغط على الرابط أدناه لإعادة التعيين:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${escapeHtml(resetLink)}" style="display: inline-block; background: #0571d5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">إعادة تعيين كلمة المرور</a>
        </div>
        <p style="font-size: 12px; color: #666;">إذا لم تكن أنت الشخص الذي طلب هذا، يمكنك تجاهل هذا البريد الإلكتروني.</p>
        <p style="font-size: 12px; color: #666;">الرابط صالح لمدة ساعة واحدة.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({ from, to, subject, html });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send password reset email");
    return false;
  }
}
