import QRCode from "qrcode";

/**
 * Render the given text payload to a PNG data-URL suitable for an <img src>.
 * Returns an empty string on failure so the document still prints.
 */
export async function qrDataUrl(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 160,
    });
  } catch {
    return "";
  }
}

/**
 * Build a compact, human-readable QR payload for a document. Embeds the company
 * name, document code/number, date, total and currency so the printed paper can
 * be scanned for quick verification.
 */
export function buildDocPayload(fields: {
  company: string;
  taxNumber?: string | null;
  docLabel: string;
  docNo: string;
  date: string;
  total: number;
  currency: string;
}): string {
  const lines = [
    fields.company,
    fields.taxNumber ? `ض.ت: ${fields.taxNumber}` : null,
    `${fields.docLabel}: ${fields.docNo}`,
    `التاريخ: ${fields.date}`,
    `الإجمالي: ${fields.total.toFixed(2)} ${fields.currency}`,
  ].filter(Boolean);
  return lines.join("\n");
}
