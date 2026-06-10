import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetInvoice,
  useGetCompany,
  type Account,
} from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import { PrintShell } from "./PrintShell";
import { DocumentHeader, DocumentFooter } from "./DocumentChrome";
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

      {/* Document metadata bar */}
      <div className="mt-5 grid grid-cols-2 gap-4 text-[12px] leading-relaxed">
        {/* Party box */}
        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            {partyLabel}
          </div>
          <div className="text-[14px] font-bold text-slate-900">
            {invoice.partyName ?? "—"}
          </div>
        </div>

        {/* Document info box */}
        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              {t("print.docNo")}
            </span>
            <span className="font-bold text-slate-900 font-sans tabular-nums" dir="ltr">
              {docNo}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              {t("invoices.date")}
            </span>
            <span className="font-bold text-slate-900 font-sans tabular-nums" dir="ltr">
              {invoice.date}
            </span>
          </div>
          {invoice.dueDate && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                {t("invoices.dueDate")}
              </span>
              <span className="font-bold text-slate-900 font-sans tabular-nums" dir="ltr">
                {invoice.dueDate}
              </span>
            </div>
          )}
          {invoice.relatedCode && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                {t("print.relatedDoc")}
              </span>
              <span className="font-bold text-slate-900 font-sans tabular-nums" dir="ltr">
                {invoice.relatedCode}
              </span>
            </div>
          )}
          {currency !== "EGP" && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                {t("invoices.currency")}
              </span>
              <span className="font-bold text-slate-900 font-sans tabular-nums" dir="ltr">
                {currency}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Lines table */}
      <table className="w-full mt-5 text-[12px] border-collapse">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-300">
            <th className="px-2 py-2 text-start w-8 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              #
            </th>
            <th className="px-2 py-2 text-start text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t("invoices.description")}
            </th>
            <th className="px-2 py-2 text-center w-16 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t("invoices.quantity")}
            </th>
            <th className="px-2 py-2 text-end w-24 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t("invoices.unitPrice")}
            </th>
            <th className="px-2 py-2 text-end w-20 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t("invoices.discount")}
            </th>
            <th className="px-2 py-2 text-end w-20 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t("invoices.tax")}
            </th>
            <th className="px-2 py-2 text-end w-28 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t("invoices.lineTotal")}
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr
              key={l.id}
              className="border-b border-slate-100 last:border-b-0"
            >
              <td className="px-2 py-2 text-center text-slate-500 font-sans tabular-nums">
                {i + 1}
              </td>
              <td className="px-2 py-2 text-start text-slate-900">
                {l.description || "—"}
              </td>
              <td className="px-2 py-2 text-center font-sans tabular-nums" dir="ltr">
                {fmt(l.quantity)}
              </td>
              <td className="px-2 py-2 text-end font-sans tabular-nums" dir="ltr">
                {fmt(l.unitPrice)}
              </td>
              <td className="px-2 py-2 text-end font-sans tabular-nums" dir="ltr">
                {fmt(l.discount)}
              </td>
              <td className="px-2 py-2 text-end font-sans tabular-nums" dir="ltr">
                {fmt(l.taxAmount)}
              </td>
              <td className="px-2 py-2 text-end font-bold text-slate-900 font-sans tabular-nums" dir="ltr">
                {fmt(l.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-80 text-[13px] flex flex-col gap-1">
          <div className="flex justify-between py-1">
            <span className="text-slate-500 text-[12px] font-bold">{t("invoices.subtotal")}</span>
            <span className="font-sans tabular-nums" dir="ltr">
              {fmt(invoice.subtotal ?? 0)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500 text-[12px] font-bold">{t("invoices.discountTotal")}</span>
            <span className="font-sans tabular-nums" dir="ltr">
              {fmt(invoice.discountTotal ?? 0)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500 text-[12px] font-bold">{t("invoices.taxTotal")}</span>
            <span className="font-sans tabular-nums" dir="ltr">
              {fmt(invoice.taxTotal ?? 0)}
            </span>
          </div>
          <div className="flex justify-between py-2 border-t-2 border-slate-900 font-bold text-[15px] text-slate-900">
            <span>{t("invoices.grandTotal")}</span>
            <span className="font-sans tabular-nums" dir="ltr">
              {fmt(invoice.total)} {currency}
            </span>
          </div>
        </div>
      </div>

      {/* Amount in words */}
      <div className="mt-4 rounded-lg border border-slate-200 p-3 bg-slate-50/50 text-[12px] leading-relaxed">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          {t("print.amountInWords")}:{" "}
        </span>
        <span className="text-slate-900">{tafqit(invoice.total, currency)}</span>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="mt-4 text-[12px] text-slate-600 leading-relaxed">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t("invoices.notes")}:{" "}
          </span>
          {invoice.notes}
        </div>
      )}

      <DocumentFooter />
    </PrintShell>
  );
}

export type { Account };
