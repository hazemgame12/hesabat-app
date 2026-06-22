import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

type LedgerLine = {
  lineId: string;
  entryId: string;
  entryNo: number;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type LedgerResponse = {
  account: { id: string; code: string; nameAr: string; nameEn: string | null; type: string };
  data: LedgerLine[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function AccountLedgerPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fmt = (n: number) =>
    n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtBalance = (n: number) => {
    const abs = Math.abs(n);
    const sign = n < -0.005 ? "(" : "";
    const end = n < -0.005 ? ")" : "";
    return `${sign}${fmt(abs)}${end}`;
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    const qs = new URLSearchParams({ page: String(page), limit: "50" });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`/api/accounts/${id}/ledger?${qs}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: LedgerResponse) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, from, to, page]);

  const accountName = data?.account
    ? lang.startsWith("en") && data.account.nameEn
      ? data.account.nameEn
      : data.account.nameAr
    : "";

  const totalDebit = data?.data.reduce((s, l) => s + l.debit, 0) ?? 0;
  const totalCredit = data?.data.reduce((s, l) => s + l.credit, 0) ?? 0;
  const lastBalance = data?.data.length ? data.data[data.data.length - 1]!.balance : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="p-6 max-w-5xl mx-auto w-full">
        <button
          onClick={() => navigate("/accounts")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />
          {t("nav.accounts")}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{accountName || t("accounts.ledger.title")}</h1>
              {data?.account && (
                <span className="text-xs font-sans font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md" dir="ltr">
                  {data.account.code}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t("accounts.ledger.title")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t("reports.from", "من")}</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-1.5 text-sm font-sans bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t("reports.to", "إلى")}</label>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-1.5 text-sm font-sans bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {(from || to) && (
            <button
              onClick={() => { setFrom(""); setTo(""); setPage(1); }}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              {t("common.clearFilter", "مسح الفلتر")}
            </button>
          )}
        </div>

        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-16">
              <Spinner className="w-8 h-8 text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
              <p className="font-bold text-destructive">{t("common.error", "حدث خطأ")}</p>
            </div>
          ) : !data || data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
              <BookOpen className="w-8 h-8 opacity-30" />
              <p className="font-bold">{t("accounts.ledger.noData")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40 border-b">
                    <th className="text-start px-4 py-3 whitespace-nowrap">{t("invoices.date")}</th>
                    <th className="text-start px-4 py-3 whitespace-nowrap">{t("accounts.ledger.entryNo")}</th>
                    <th className="text-start px-4 py-3">{t("accounts.ledger.description")}</th>
                    <th className="text-end px-4 py-3 whitespace-nowrap">{t("accounts.ledger.debit")}</th>
                    <th className="text-end px-4 py-3 whitespace-nowrap">{t("accounts.ledger.credit")}</th>
                    <th className="text-end px-4 py-3 whitespace-nowrap">{t("accounts.ledger.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((line) => (
                    <tr key={line.lineId} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-sans text-foreground/80 whitespace-nowrap" dir="ltr">
                        {line.date}
                      </td>
                      <td className="px-4 py-3 font-sans font-bold whitespace-nowrap" dir="ltr">
                        #{line.entryNo}
                      </td>
                      <td className="px-4 py-3 text-foreground/80 max-w-xs">
                        <div className="truncate">{line.description || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-end font-sans tabular-nums whitespace-nowrap" dir="ltr">
                        {line.debit > 0.005 ? (
                          <span className="text-primary font-medium">{fmt(line.debit)}</span>
                        ) : (
                          <span className="text-foreground/25">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end font-sans tabular-nums whitespace-nowrap" dir="ltr">
                        {line.credit > 0.005 ? (
                          <span className="text-destructive font-medium">{fmt(line.credit)}</span>
                        ) : (
                          <span className="text-foreground/25">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end font-sans tabular-nums font-bold whitespace-nowrap" dir="ltr">
                        <span className={line.balance < -0.005 ? "text-destructive" : "text-foreground"}>
                          {fmtBalance(line.balance)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t-2 border-border font-bold text-sm">
                    <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                      {t("common.total", "الإجمالي")} — {data.total} {t("common.row", "سطر")}
                    </td>
                    <td className="px-4 py-3 text-end font-sans tabular-nums text-primary" dir="ltr">
                      {fmt(totalDebit)}
                    </td>
                    <td className="px-4 py-3 text-end font-sans tabular-nums text-destructive" dir="ltr">
                      {fmt(totalCredit)}
                    </td>
                    <td className="px-4 py-3 text-end font-sans tabular-nums" dir="ltr">
                      <span className={lastBalance < -0.005 ? "text-destructive" : ""}>{fmtBalance(lastBalance)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
            </button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {data.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="p-1.5 rounded-lg border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
