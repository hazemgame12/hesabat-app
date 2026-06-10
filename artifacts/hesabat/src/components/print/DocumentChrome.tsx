import React from "react";
import { useTranslation } from "react-i18next";
import type { Company } from "@workspace/api-client-react";

export function infoRow(label: string, value: React.ReactNode) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{label}</span>
      <span className="font-bold text-slate-900" dir="auto">
        {value}
      </span>
    </div>
  );
}

/**
 * Company masthead shared by every printed document: logo (if any), legal name,
 * trade name, tax registration number, address/phone, the document title, and a
 * QR image (if generated).
 */
export function DocumentHeader({
  company,
  title,
  qr,
}: {
  company: Company;
  title: string;
  qr: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
      <div className="flex items-start gap-3">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt=""
            className="w-16 h-16 object-contain"
          />
        ) : null}
        <div>
          <div className="text-[18px] font-bold leading-tight text-slate-900">
            {company.name}
          </div>
          {company.tradeName && (
            <div className="text-[13px] text-slate-500">{company.tradeName}</div>
          )}
          {company.taxRegistrationNumber && (
            <div className="text-[12px] text-slate-500">
              س.ت/ض: {company.taxRegistrationNumber}
            </div>
          )}
          {company.address && (
            <div className="text-[12px] text-slate-500">{company.address}</div>
          )}
          {company.phone && (
            <div className="text-[12px] text-slate-500" dir="ltr">
              {company.phone}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="text-[20px] font-bold text-primary">{title}</div>
        {qr ? <img src={qr} alt="QR" className="w-24 h-24" /> : null}
      </div>
    </div>
  );
}

export function DocumentFooter() {
  const { t } = useTranslation();
  return (
    <div className="mt-12 grid grid-cols-2 gap-8 text-[12px]">
      <div className="flex flex-col items-center gap-8">
        <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{t("print.preparedBy")}</div>
        <div className="border-t border-slate-400 w-40" />
      </div>
      <div className="flex flex-col items-center gap-8">
        <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{t("print.receivedBy")}</div>
        <div className="border-t border-slate-400 w-40" />
      </div>
    </div>
  );
}
