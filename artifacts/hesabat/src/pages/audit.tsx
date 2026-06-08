import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetAuditLog,
  type AuditLogEntry,
  type GetAuditLogParams,
} from "@workspace/api-client-react";
import { History } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const ENTITY_OPTIONS = [
  "journal_entry",
  "customer",
  "supplier",
  "sales_invoice",
  "purchase_invoice",
  "receipt_voucher",
  "payment_voucher",
  "attachment",
] as const;

type TFn = (key: string, opts?: { defaultValue?: string }) => string;

function formatScalar(v: unknown, t: TFn): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    return t(`auditPage.values.${v}`, { defaultValue: v });
  }
  return String(v);
}

function formatValue(value: unknown, t: TFn): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([k, v]) =>
          `${t(`auditPage.fields.${k}`, { defaultValue: k })}: ${formatScalar(
            v,
            t,
          )}`,
      )
      .join("، ");
  }
  return formatScalar(value, t);
}

export function Audit() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [entity, setEntity] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const params = useMemo<GetAuditLogParams>(() => {
    const p: GetAuditLogParams = { limit: 200 };
    if (entity !== "all") p.entity = entity;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [entity, from, to]);

  const { data: entries = [], isLoading } = useGetAuditLog(params);

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <History className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t("auditPage.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("auditPage.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mt-6">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t("auditPage.filters.entity")}
          </label>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("auditPage.filters.all")}</SelectItem>
              {ENTITY_OPTIONS.map((e) => (
                <SelectItem key={e} value={e}>
                  {t(`auditPage.entities.${e}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t("auditPage.filters.from")}
          </label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t("auditPage.filters.to")}
          </label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("auditPage.empty")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("auditPage.columns.date")}</TableHead>
                <TableHead>{t("auditPage.columns.user")}</TableHead>
                <TableHead>{t("auditPage.columns.action")}</TableHead>
                <TableHead>{t("auditPage.columns.entity")}</TableHead>
                <TableHead>{t("auditPage.columns.before")}</TableHead>
                <TableHead>{t("auditPage.columns.after")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((row: AuditLogEntry) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fmtDate(row.createdAt)}
                  </TableCell>
                  <TableCell>{row.userName ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                      {t(`auditPage.actions.${row.action}`, {
                        defaultValue: row.action,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="flex flex-col">
                      <span>
                        {t(`auditPage.entities.${row.entity}`, {
                          defaultValue: row.entity,
                        })}
                      </span>
                      {row.entityLabel ? (
                        <span className="text-xs font-medium text-foreground">
                          {row.entityLabel}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs">
                    {formatValue(row.oldValue, t)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs">
                    {formatValue(row.newValue, t)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
