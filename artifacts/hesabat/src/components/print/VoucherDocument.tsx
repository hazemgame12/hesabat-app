import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGetPayment, useGetCompany } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import { PrintShell } from "./PrintShell";
import { DocumentHeader, DocumentFooter } from "./DocumentChrome";
import { tafqit } from "./tafqit";
import { buildDocPayload, qrDataUrl } from "./qr";

export function VoucherDocument({
  paymentId,
  onBack,
}: {
  paymentId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { data: payment, isLoading, isError } = useGetPayment(paymentId);
  const { data: company } = useGetCompany();
  const [qr, setQr] = useState("");

  const fmt = (n: number) =>
    new Intl.NumberFormat("en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const currency = payment?.currency ?? company?.baseCurrency ?? "EGP";
  const isCollection = payment?.kind === "collection";
  const title = t(isCollection ? "print.titles.receipt" : "print.titles.payment");
  const docNo = payment ? `${isCollection ? "RV" : "PV"}-${payment.paymentNo}` : "";

  useEffect(() => {
    if (!payment || !company) return;
    const payload = buildDocPayload({
      company: company.name,
      taxNumber: company.taxRegistrationNumber,
      docLabel: title,
      docNo,
      date: payment.date,
      total: payment.amount,
      currency,
    });
    qrDataUrl(payload).then(setQr);
  }, [payment, company, docNo, currency, title]);

  if (isError || (!isLoading && !payment)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="font-bold text-foreground">{t("invoices.notFound")}</p>
        <button onClick={onBack} className="text-primary font-bold hover:underline">
          {t("print.back")}
        </button>
      </div>
    );
  }

  if (isLoading || !payment || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const partyLabel = isCollection
    ? t("print.receivedFrom")
    : t("print.paidTo");

  return (
    <PrintShell onBack={onBack}>
      <DocumentHeader company={company} title={title} qr={qr} />

      {/* Metadata bar */}
      <div className="mt-5 grid grid-cols-2 gap-4 text-[12px] leading-relaxed">
        {/* Party box */}
        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            {partyLabel}
          </div>
          <div className="text-[14px] font-bold text-slate-900">
            {payment.partyName ?? "—"}
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
              {payment.date}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              {t("invoices.method")}
            </span>
            <span className="font-bold text-slate-900">
              {t(`invoices.methods.${payment.method}`)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
              {t("invoices.cashAccount")}
            </span>
            <span className="font-bold text-slate-900">
              {payment.cashAccountName ?? "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Amount highlight box */}
      <div className="mt-5 rounded-lg border-2 border-slate-900 bg-slate-50 p-5 flex items-center justify-between">
        <span className="font-bold text-[15px] text-slate-900">{t("invoices.amount")}</span>
        <span className="font-bold text-[22px] text-slate-900 font-sans tabular-nums" dir="ltr">
          {fmt(payment.amount)} {currency}
        </span>
      </div>

      {/* Amount in words */}
      <div className="mt-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50 text-[12px] leading-relaxed">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          {t("print.amountInWords")}:{" "}
        </span>
        <span className="text-slate-900">{tafqit(payment.amount, currency)}</span>
      </div>

      {/* Allocations table */}
      {payment.allocations.length > 0 && (
        <table className="w-full mt-5 text-[12px] border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="px-2 py-2 text-start text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {t("print.settledInvoice")}
              </th>
              <th className="px-2 py-2 text-end w-32 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {t("invoices.amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-2 text-start font-sans tabular-nums" dir="ltr">
                  #{a.invoiceNo ?? "—"}
                </td>
                <td className="px-2 py-2 text-end font-sans tabular-nums" dir="ltr">
                  {fmt(a.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Notes */}
      {payment.notes && (
        <div className="mt-4 text-[12px] text-slate-600 leading-relaxed">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t("invoices.notes")}:{" "}
          </span>
          {payment.notes}
        </div>
      )}

      <DocumentFooter />
    </PrintShell>
  );
}
