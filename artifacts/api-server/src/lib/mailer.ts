import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

let cachedSmtp: Transporter | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getSmtpTransporter(): Transporter | null {
  if (cachedSmtp) return cachedSmtp;
  const host = process.env["SMTP_HOST"];
  const port = process.env["SMTP_PORT"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!host || !port || !user || !pass) {
    return null;
  }
  cachedSmtp = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return cachedSmtp;
}

function getEmailProvider(): "resend" | "smtp" | "none" {
  if (process.env["RESEND_API_KEY"]) return "resend";
  if (getSmtpTransporter()) return "smtp";
  return "none";
}

function getFromAddress(): string {
  const from = process.env["SMTP_FROM"] ?? process.env["SMTP_USER"];
  if (from) return from;
  return "info@hg-audit.com";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function sendEmailViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) return false;
  const from = getFromAddress();
  try {
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      logger.error({ error }, "Resend email failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Resend email threw");
    return false;
  }
}

async function sendEmailViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getSmtpTransporter();
  if (!transporter) return false;
  const from = getFromAddress();
  try {
    await transporter.sendMail({ from, to, subject, html });
    return true;
  } catch (err) {
    logger.error({ err }, "SMTP email failed");
    return false;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const provider = getEmailProvider();
  if (provider === "none") {
    logger.warn("No email provider configured");
    return false;
  }
  if (provider === "resend") {
    return sendEmailViaResend(to, subject, html);
  }
  return sendEmailViaSmtp(to, subject, html);
}

export async function sendLeadNotification(lead: {
  name: string;
  phone: string;
  email: string;
  message: string;
  service?: string;
}): Promise<boolean> {
  const to = process.env["LEAD_NOTIFICATION_TO"] ?? process.env["SMTP_USER"];
  if (!to) return false;

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

  return sendEmail(to, subject, html);
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<boolean> {
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

  return sendEmail(to, subject, html);
}
