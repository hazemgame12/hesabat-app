import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  useListRevaluations,
  usePreviewRevaluation,
  useRunRevaluation,
  useGetCompany,
  useGetCurrentUser,
  getListRevaluationsQueryKey,
  getPreviewRevaluationQueryKey,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Eye, TrendingUp, FileText } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Revaluation() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: company } = useGetCompany();
  const baseCurrency = company?.baseCurrency || "EGP";
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canRun = hasCapability(role, "revaluation:run");

  const [asOfDate, setAsOfDate] = useState(today());
  const [previewDate, setPreviewDate] = useState<string | null>(null);

  const { data: preview, isFetching: isPreviewing } = usePreviewRevaluation(
    { asOfDate: previewDate ?? "" },
    {
      query: {
        enabled: !!previewDate,
        queryKey: getPreviewRevaluationQueryKey({ asOfDate: previewDate ?? "" }),
      },
    },
  );

  const { data: runs = [], isLoading: runsLoading } = useListRevaluations();
  const runRevaluation = useRunRevaluation();

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const fmtRate = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(lang, { dateStyle: "medium" });

  const handlePreview = () => {
    if (!asOfDate) return;
    setPreviewDate(asOfDate);
  };

  const handleRun = () => {
    if (!asOfDate) return;
    runRevaluation.mutate(
      { data: { asOfDate } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListRevaluationsQueryKey(),
          });
          toast({ title: t("revaluation.toast.success") });
        },
        onError: (err: any) => {
          let description = t("revaluation.toast.error");
          if (err?.status === 409) {
            description = t("revaluation.toast.alreadyRevalued");
          } else if (err?.status === 400) {
            description =
              err?.data?.error || t("revaluation.toast.closedPeriod");
          } else if (err?.data?.error) {
            description = err.data.error;
          }
          toast({
            variant: "destructive",
            title: t("common.error"),
            description,
          });
        },
      },
    );
  };

  const net = preview ? preview.totalGain - preview.totalLoss : 0;

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t("revaluation.title")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t("revaluation.subtitle")}
            </p>
          </div>
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <div className="bg-secondary/40 border border-secondary rounded-xl px-5 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("revaluation.explainer", { base: baseCurrency })}
          </p>
        </div>

        <div className="bg-card border rounded-2xl shadow-sm p-5 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-foreground">
              {t("revaluation.asOfDate")}
            </span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </label>
          <button
            onClick={handlePreview}
            disabled={!asOfDate || isPreviewing}
            className="flex items-center gap-2 bg-card border text-foreground px-4 py-2.5 rounded-full text-sm font-bold hover:bg-muted transition-colors disabled:opacity-60"
          >
            <Eye className="w-4 h-4" />
            {isPreviewing ? t("revaluation.previewing") : t("revaluation.preview")}
          </button>
          {canRun && (
            <button
              onClick={handleRun}
              disabled={runRevaluation.isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <RefreshCw
                className={`w-4 h-4 ${runRevaluation.isPending ? "animate-spin" : ""}`}
              />
              {runRevaluation.isPending
                ? t("revaluation.running")
                : t("revaluation.run")}
            </button>
          )}
        </div>

        {previewDate && (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[200px]">
            {isPreviewing ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : !preview || preview.lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("revaluation.empty")}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                        <th className="text-start px-6 py-3">
                          {t("revaluation.columns.account")}
                        </th>
                        <th className="text-start px-3 py-3">
                          {t("revaluation.columns.currency")}
                        </th>
                        <th className="text-end px-3 py-3">
                          {t("revaluation.columns.foreignBalance")}
                        </th>
                        <th className="text-end px-3 py-3">
                          {t("revaluation.columns.baseBook")}
                        </th>
                        <th className="text-end px-3 py-3">
                          {t("revaluation.columns.rate")}
                        </th>
                        <th className="text-end px-3 py-3">
                          {t("revaluation.columns.revaluedBase")}
                        </th>
                        <th className="text-end px-6 py-3">
                          {t("revaluation.columns.unrealized")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((l) => (
                        <tr
                          key={l.accountId}
                          className="border-t hover:bg-muted/40 transition-colors"
                        >
                          <td className="px-6 py-3.5">
                            <span className="font-sans font-bold text-foreground bg-muted px-2 py-0.5 rounded-md me-2" dir="ltr">
                              {l.accountCode}
                            </span>
                            <span className="font-medium text-foreground">
                              {l.accountName}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 font-sans" dir="ltr">
                            {l.currency}
                          </td>
                          <td className="px-3 py-3.5 text-end tabular-nums" dir="ltr">
                            {fmt(l.foreignBalance)}
                          </td>
                          <td className="px-3 py-3.5 text-end tabular-nums" dir="ltr">
                            {fmt(l.baseBook)}
                          </td>
                          <td className="px-3 py-3.5 text-end tabular-nums" dir="ltr">
                            {fmtRate(l.rate)}
                          </td>
                          <td className="px-3 py-3.5 text-end tabular-nums" dir="ltr">
                            {fmt(l.revaluedBase)}
                          </td>
                          <td
                            className={`px-6 py-3.5 text-end tabular-nums font-bold ${
                              l.unrealized > 0
                                ? "text-success"
                                : l.unrealized < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }`}
                            dir="ltr"
                          >
                            {fmt(l.unrealized)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-6 px-6 py-4 border-t bg-muted/30">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("revaluation.totals.gain")}
                    </span>
                    <span className="font-bold tabular-nums text-success" dir="ltr">
                      {fmt(preview.totalGain)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("revaluation.totals.loss")}
                    </span>
                    <span className="font-bold tabular-nums text-destructive" dir="ltr">
                      {fmt(preview.totalLoss)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("revaluation.totals.net")}
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        net > 0
                          ? "text-success"
                          : net < 0
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                      dir="ltr"
                    >
                      {fmt(net)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-foreground">
            {t("revaluation.pastRuns")}
          </h2>
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[200px]">
            {runsLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("revaluation.noRuns")}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                      <th className="text-start px-6 py-3">
                        {t("revaluation.columns.date")}
                      </th>
                      <th className="text-end px-3 py-3">
                        {t("revaluation.totals.gain")}
                      </th>
                      <th className="text-end px-3 py-3">
                        {t("revaluation.totals.loss")}
                      </th>
                      <th className="text-center px-3 py-3">
                        {t("revaluation.columns.linesCount")}
                      </th>
                      <th className="text-start px-3 py-3">
                        {t("revaluation.columns.createdAt")}
                      </th>
                      <th className="text-start px-6 py-3">
                        {t("revaluation.columns.journalEntry")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-6 py-3.5 font-medium text-foreground">
                          {fmtDate(r.asOfDate)}
                        </td>
                        <td className="px-3 py-3.5 text-end tabular-nums text-success" dir="ltr">
                          {fmt(r.totalGain)}
                        </td>
                        <td className="px-3 py-3.5 text-end tabular-nums text-destructive" dir="ltr">
                          {fmt(r.totalLoss)}
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums">
                          {r.linesCount}
                        </td>
                        <td className="px-3 py-3.5 text-muted-foreground">
                          {fmtDate(r.createdAt)}
                        </td>
                        <td className="px-6 py-3.5">
                          {r.journalEntryId ? (
                            <Link
                              href="/journal"
                              className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline"
                            >
                              <FileText className="w-4 h-4" />
                              {t("revaluation.viewEntry")}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
