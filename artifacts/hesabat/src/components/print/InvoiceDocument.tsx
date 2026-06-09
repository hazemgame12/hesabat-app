import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetInvoice,
  useGetCompany,
  type Account,
} from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import { PrintShell } from "./PrintShell";
import { DocumentHeader, DocumentFooter, infoRow } from "./DocumentChrome";
import { tafqit } from "./tafqit";
import { buildDocPayload, qrDataUrl } from "./qr";

type Kind = "sales" | "purchase" | "sales_return" | "purchase_return";

function docTitleKey(kind: Kind): string {
  switch (kind) {
    case "sales":
      return "print.titles.salesInvoice";
    case "purchase":
      return "print.titles.purchaseInvoice";
    case "sales_return":
      return "print.titles.creditNote";
    case "purchase_return":
      return "print.titles.debitNote";
  }
}

export function InvoiceDocument({
  invoiceId,
  onBack,
}: {
  invoiceId: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: invoice, isLoading, isError } = useGetInvoice(invoiceId);
  const { data: company } = useGetCompany();
  const [qr, setQr] = useState("");

  const fmt = (n: number) =>
    new Intl.NumberFormat("en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const currency = invoice?.currency ?? company?.baseCurrency ?? "EGP";
  const docNo = invoice?.code || (invoice ? `#${invoice.invoiceNo}` : "");

  useEffect(() => {
    if (!invoice || !company) return;
    const payload = buildDocPayload({
      company: company.name,
      taxNumber: company.taxRegistrationNumber,
      docLabel: t(docTitleKey(invoice.kind as Kind)),
      docNo,
      date: invoice.date,
      total: invoice.total,
      currency,
    });
    qrDataUrl(payload).then(setQr);
  }, [invoice, company, docNo, currency, t]);

  if (isError || (!isLoading && !invoice)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="font-bold text-foreground">{t("invoices.notFound")}</p>
        <button onClick={onBack} className="text-primary font-bold hover:underline">
          {t("print.back")}
        </button>
      </div>
    );
  }

  if (isLoading || !invoice || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const kind = invoice.kind as Kind;
  const isCustomerSide = kind === "sales" || kind === "sales_return";
  const partyLabel = isCustomerSide ? t("invoices.customer") : t("invoices.supplier");

  return (
    <PrintShell onBack={onBack}>
      <DocumentHeader
        company={company}
        title={t(docTitleKey(kind))}
        qr={qr}
      />

      <div className="grid grid-cols-2 gap-6 mt-6 text-[13px]">
        <div className="border rounded-lg p-3">
          <div className="font-bold text-[12px] text-gray-500 mb-1">
            {partyLabel}
          </div>
          <div className="font-bold text-[15px]">{invoice.partyName ?? "—"}</div>
        </div>
        <div className="border rounded-lg p-3 flex flex-col gap-1">
          {infoRow(t("print.docNo"), docNo)}
          {infoRow(t("invoices.date"), invoice.date)}
          {invoice.dueDate && infoRow(t("invoices.dueDate"), invoice.dueDate)}
          {invoice.relatedCode &&
            infoRow(t("print.relatedDoc"), invoice.relatedCode)}
          {currency !== "EGP" && infoRow(t("invoices.currency"), currency)}
        </div>
      </div>

      <table className="w-full mt-6 text-[13px] border-collapse">
        <thead>
          <tr className="bg-gray-100 text-[12px]">
            <th className="border p-2 text-start w-8">#</th>
            <th className="border p-2 text-start">{t("invoices.description")}</th>
            <th className="border p-2 text-center w-16">{t("invoices.quantity")}</th>
            <th className="border p-2 text-end w-24">{t("invoices.unitPrice")}</th>
            <th className="border p-2 text-end w-20">{t("invoices.discount")}</th>
            <th className="border p-2 text-end w-20">{t("invoices.tax")}</th>
            <th className="border p-2 text-end w-24">{t("invoices.lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={l.id}>
              <td className="border p-2 text-center">{i + 1}</td>
              <td className="border p-2 text-start">{l.description || "—"}</td>
              <td className="border p-2 text-center" dir="ltr">
                {fmt(l.quantity)}
              </td>
              <td className="border p-2 text-end" dir="ltr">
                {fmt(l.unitPrice)}
              </td>
              <td className="border p-2 text-end" dir="ltr">
                {fmt(l.discount)}
              </td>
              <td className="border p-2 text-end" dir="ltr">
                {fmt(l.taxAmount)}
              </td>
              <td className="border p-2 text-end font-bold" dir="ltr">
                {fmt(l.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mt-4">
        <div className="w-72 text-[13px] flex flex-col gap-1">
          <div className="flex justify-between py-1">
            <span className="text-gray-500">{t("invoices.subtotal")}</span>
            <span dir="ltr">{fmt(invoice.subtotal ?? 0)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">{t("invoices.discountTotal")}</span>
            <span dir="ltr">{fmt(invoice.discountTotal ?? 0)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">{t("invoices.taxTotal")}</span>
            <span dir="ltr">{fmt(invoice.taxTotal ?? 0)}</span>
          </div>
          <div className="flex justify-between py-2 border-t-2 border-black font-bold text-[15px]">
            <span>{t("invoices.grandTotal")}</span>
            <span dir="ltr">
              {fmt(invoice.total)} {currency}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 border rounded-lg p-3 bg-gray-50 text-[13px]">
        <span className="font-bold text-gray-500">{t("print.amountInWords")}: </span>
        {tafqit(invoice.total, currency)}
      </div>

      {invoice.notes && (
        <div className="mt-4 text-[12px] text-gray-600">
          <span className="font-bold">{t("invoices.notes")}: </span>
          {invoice.notes}
        </div>
      )}

      <DocumentFooter />
    </PrintShell>
  );
}

export type { Account };
