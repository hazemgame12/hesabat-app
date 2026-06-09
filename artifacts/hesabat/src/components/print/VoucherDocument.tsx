import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGetPayment, useGetCompany } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import { PrintShell } from "./PrintShell";
import { DocumentHeader, DocumentFooter, infoRow } from "./DocumentChrome";
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

      <div className="grid grid-cols-2 gap-6 mt-6 text-[13px]">
        <div className="border rounded-lg p-3">
          <div className="font-bold text-[12px] text-gray-500 mb-1">
            {partyLabel}
          </div>
          <div className="font-bold text-[15px]">{payment.partyName ?? "—"}</div>
        </div>
        <div className="border rounded-lg p-3 flex flex-col gap-1">
          {infoRow(t("print.docNo"), docNo)}
          {infoRow(t("invoices.date"), payment.date)}
          {infoRow(t("invoices.method"), t(`invoices.methods.${payment.method}`))}
          {infoRow(t("invoices.cashAccount"), payment.cashAccountName ?? "—")}
        </div>
      </div>

      <div className="mt-6 border-2 border-black rounded-lg p-4 flex items-center justify-between">
        <span className="font-bold text-[15px]">{t("invoices.amount")}</span>
        <span className="font-bold text-[22px]" dir="ltr">
          {fmt(payment.amount)} {currency}
        </span>
      </div>

      <div className="mt-3 border rounded-lg p-3 bg-gray-50 text-[13px]">
        <span className="font-bold text-gray-500">{t("print.amountInWords")}: </span>
        {tafqit(payment.amount, currency)}
      </div>

      {payment.allocations.length > 0 && (
        <table className="w-full mt-6 text-[13px] border-collapse">
          <thead>
            <tr className="bg-gray-100 text-[12px]">
              <th className="border p-2 text-start">{t("print.settledInvoice")}</th>
              <th className="border p-2 text-end w-32">{t("invoices.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((a) => (
              <tr key={a.id}>
                <td className="border p-2 text-start" dir="ltr">
                  #{a.invoiceNo ?? "—"}
                </td>
                <td className="border p-2 text-end" dir="ltr">
                  {fmt(a.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {payment.notes && (
        <div className="mt-4 text-[12px] text-gray-600">
          <span className="font-bold">{t("invoices.notes")}: </span>
          {payment.notes}
        </div>
      )}

      <DocumentFooter />
    </PrintShell>
  );
}
