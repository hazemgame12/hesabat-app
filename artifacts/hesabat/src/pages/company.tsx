/* HESABAT_INBOX_ENABLED_v20250625 */
import React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  useGetCompany,
  useUpdateCompany,
  useGetCurrentUser,
  getGetCompanyQueryKey,
  type Company,
  type CompanyUpdateCountry,
  type CompanyUpdateBaseCurrency,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import {
  COUNTRIES,
  CURRENCIES,
  COUNTRY_INFO,
  countryLabel,
  currencyLabel,
  countryName,
  currencyName,
  type Lang,
} from "@workspace/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Building2, Upload, Globe, Coins, ImageOff, Lock, Mail, Copy, RefreshCw } from "lucide-react";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

type FormValues = {
  name: string;
  tradeName: string;
  taxRegistrationNumber: string;
  activityDescription: string;
  country: string;
  baseCurrency: string;
  address: string;
  phone: string;
};

function toForm(c: Company): FormValues {
  return {
    name: c.name ?? "",
    tradeName: c.tradeName ?? "",
    taxRegistrationNumber: c.taxRegistrationNumber ?? "",
    activityDescription: c.activityDescription ?? "",
    country: c.country ?? "EG",
    baseCurrency: c.baseCurrency ?? "EGP",
    address: c.address ?? "",
    phone: c.phone ?? "",
  };
}

export function CompanyProfile() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "ar") as Lang;
  const { data: user } = useGetCurrentUser();
  const canEdit = hasCapability(user?.role ?? "", "company:manage");
  const { data: company, isLoading } = useGetCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateCompany = useUpdateCompany();
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [inboxCopied, setInboxCopied] = React.useState(false);
  const [inboxRegenerating, setInboxRegenerating] = React.useState(false);

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "passwordRequired"),
    newPassword: z.string().min(8, "passwordMin"),
    confirmPassword: z.string().min(1, "passwordRequired"),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

  const pwForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
  });
  const [pwLoading, setPwLoading] = React.useState(false);

  const inboxEmail = (company as any)?.inboxEmail as string | null | undefined;

  const onCopyInbox = async () => {
    if (!inboxEmail) return;
    try {
      await navigator.clipboard.writeText(inboxEmail);
      setInboxCopied(true);
      toast({ title: t("company.inbox.toast.copied") });
      setTimeout(() => setInboxCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: t("company.inbox.toast.error") });
    }
  };

  const onRegenerateInbox = async () => {
    if (!window.confirm(t("company.inbox.regenerateWarning"))) return;
    setInboxRegenerating(true);
    try {
      const res = await fetch("/api/company/regenerate-inbox-token", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey() });
      toast({ title: t("company.inbox.toast.regenerated") });
    } catch {
      toast({ variant: "destructive", title: t("company.inbox.toast.error") });
    } finally {
      setInboxRegenerating(false);
    }
  };

  const onChangePassword = async (data: z.infer<typeof changePasswordSchema>) => {
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });
      if (res.ok) {
        toast({ title: t("company.password.success") });
        pwForm.reset();
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: body.error || t("company.password.error") });
      }
    } catch {
      toast({ variant: "destructive", title: t("company.password.error") });
    } finally {
      setPwLoading(false);
    }
  };

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      name: "",
      tradeName: "",
      taxRegistrationNumber: "",
      activityDescription: "",
      country: "EG",
      baseCurrency: "EGP",
      address: "",
      phone: "",
    },
  });

  React.useEffect(() => {
    if (!company) return;
    reset(toForm(company));
  }, [company, reset]);

  const country = watch("country");
  const baseCurrency = watch("baseCurrency");

  const onSubmit = (values: FormValues) => {
    updateCompany.mutate(
      {
        data: {
          name: values.name,
          tradeName: values.tradeName || null,
          taxRegistrationNumber: values.taxRegistrationNumber || null,
          activityDescription: values.activityDescription || null,
          country: values.country as CompanyUpdateCountry,
          baseCurrency: values.baseCurrency as CompanyUpdateBaseCurrency,
          address: values.address || null,
          phone: values.phone || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey() });
          toast({ title: t("company.toast.saved") });
        },
        onError: (err: any) => {
          toast({
            title: err?.data?.error || t("company.toast.saveError"),
            variant: "destructive",
          });
        },
      },
    );
  };

  const onPickLogo = () => fileInputRef.current?.click();

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/company/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t("company.toast.logoError"));
      }
      await queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey() });
      toast({ title: t("company.toast.logoUpdated") });
    } catch (err: any) {
      toast({ title: err?.message || t("company.toast.logoError"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-7 pb-1">
        <h2 className="text-base font-extrabold text-foreground">{t("company.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("company.subtitle")}</p>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full">
        {/* Logo + identity */}
        <Card className="p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-28 h-28 rounded-2xl bg-muted border flex items-center justify-center overflow-hidden shrink-0">
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={t("company.logoAlt")}
                className="w-full h-full object-contain"
              />
            ) : (
              <ImageOff className="w-10 h-10 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 text-center sm:text-start">
            <h2 className="text-xl font-bold">{company?.name}</h2>
            {company?.tradeName && (
              <p className="text-sm text-muted-foreground mt-1">
                {t("company.tradeNameInline", { name: company.tradeName })}
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-3">
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/5 text-primary px-3 py-1 rounded-full">
                <Globe className="w-3.5 h-3.5" />
                {countryLabel(company?.country ?? "EG", lang)}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-success/10 text-success px-3 py-1 rounded-full">
                <Coins className="w-3.5 h-3.5" />
                {currencyLabel(company?.baseCurrency ?? "EGP", lang)}
              </span>
            </div>
          </div>
          {canEdit && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onLogoChange}
              />
              <Button
                type="button"
                variant="outline"
                onClick={onPickLogo}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {company?.logoUrl ? t("company.changeLogo") : t("company.uploadLogo")}
              </Button>
            </div>
          )}
        </Card>

        {/* Details form */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary/5 p-2.5 rounded-xl text-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold">{t("company.details")}</h2>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("company.name")}</Label>
              <Input id="name" disabled={!canEdit} {...register("name")} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tradeName">{t("company.tradeName")}</Label>
              <Input
                id="tradeName"
                disabled={!canEdit}
                placeholder={t("company.tradeNamePlaceholder")}
                {...register("tradeName")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="taxRegistrationNumber">{t("company.taxNumber")}</Label>
              <Input
                id="taxRegistrationNumber"
                dir="ltr"
                className="text-start"
                disabled={!canEdit}
                placeholder={t("company.taxNumberPlaceholder")}
                {...register("taxRegistrationNumber")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">{t("company.phone")}</Label>
              <Input
                id="phone"
                dir="ltr"
                className="text-start"
                disabled={!canEdit}
                {...register("phone")}
              />
            </div>

            <div className="flex flex-col gap-2">
              {/* Hidden inputs register country/baseCurrency so reset() properly updates them */}
              <input type="hidden" {...register("country")} />
              <input type="hidden" {...register("baseCurrency")} />
              <Label>{t("company.country")}</Label>
              <Select
                value={country}
                disabled={!canEdit}
                onValueChange={(v) => {
                  setValue("country", v, { shouldDirty: true });
                  const def = COUNTRY_INFO[v as keyof typeof COUNTRY_INFO]
                    ?.defaultCurrency;
                  if (def) setValue("baseCurrency", def, { shouldDirty: true });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {countryName(c, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t("company.baseCurrency")}</Label>
              <Select
                value={baseCurrency}
                disabled={!canEdit}
                onValueChange={(v) => setValue("baseCurrency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {currencyName(c, lang)} ({c})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="activityDescription">{t("company.activity")}</Label>
              <Textarea
                id="activityDescription"
                rows={2}
                disabled={!canEdit}
                placeholder={t("company.activityPlaceholder")}
                {...register("activityDescription")}
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="address">{t("company.address")}</Label>
              <Textarea
                id="address"
                rows={2}
                disabled={!canEdit}
                {...register("address")}
              />
            </div>

            {canEdit && (
              <div className="md:col-span-2 flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={updateCompany.isPending}
                  className="h-11 px-8 font-bold"
                >
                  {updateCompany.isPending ? t("common.saving") : t("company.saveChanges")}
                </Button>
              </div>
            )}
          </form>
        </Card>

        {/* Password change section */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary/5 p-2.5 rounded-xl text-primary">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold">{t("company.password.title")}</h2>
          </div>
          <form onSubmit={pwForm.handleSubmit(onChangePassword)} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="currentPassword">{t("company.password.current")}</Label>
              <Input
                id="currentPassword"
                type="password"
                dir="ltr"
                className="text-start focus-visible:ring-primary"
                {...pwForm.register("currentPassword")}
              />
              {pwForm.formState.errors.currentPassword && <span className="text-xs text-destructive">{t(`auth.validation.${pwForm.formState.errors.currentPassword.message}`)}</span>}
            </div>
            <div />
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">{t("company.password.new")}</Label>
              <Input
                id="newPassword"
                type="password"
                dir="ltr"
                className="text-start focus-visible:ring-primary"
                {...pwForm.register("newPassword")}
              />
              {pwForm.formState.errors.newPassword && <span className="text-xs text-destructive">{t(`auth.validation.${pwForm.formState.errors.newPassword.message}`)}</span>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">{t("company.password.confirm")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                dir="ltr"
                className="text-start focus-visible:ring-primary"
                {...pwForm.register("confirmPassword")}
              />
              {pwForm.formState.errors.confirmPassword && <span className="text-xs text-destructive">{t(`auth.validation.${pwForm.formState.errors.confirmPassword.message}`)}</span>}
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={pwLoading} className="h-11 px-8 font-bold">
                {pwLoading ? t("company.password.changing") : t("company.password.change")}
              </Button>
            </div>
          </form>
        </Card>

        {/* Document Inbox */}
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">{t("company.inbox.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("company.inbox.subtitle")}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("company.inbox.label")}
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center h-11 px-3 rounded-lg border bg-muted/40 font-mono text-sm select-all overflow-x-auto whitespace-nowrap dir-ltr text-start">
                {inboxEmail ?? <span className="text-muted-foreground text-xs">{t("common.loading")}</span>}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={!inboxEmail}
                onClick={onCopyInbox}
                title={t("company.inbox.copy")}
              >
                {inboxCopied ? (
                  <span className="text-success text-xs font-bold">✓</span>
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-primary/5 border border-primary/10 p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-primary">{t("company.inbox.howTitle")}</p>
            <ol className="flex flex-col gap-2.5">
              {(["step1", "step2", "step3"] as const).map((key, i) => (
                <li key={key} className="flex items-start gap-2.5">
                  <span className="bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    {t(`company.inbox.${key}`)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground/70 border-t border-primary/10 pt-2">
              {t("company.inbox.privacy")}
            </p>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-2"
                disabled={inboxRegenerating}
                onClick={onRegenerateInbox}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${inboxRegenerating ? "animate-spin" : ""}`} />
                {inboxRegenerating ? t("company.inbox.regenerating") : t("company.inbox.regenerate")}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
