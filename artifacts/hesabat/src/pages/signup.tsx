import React from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useSignup, useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COUNTRIES,
  CURRENCIES,
  COUNTRY_INFO,
  countryName,
  currencyName,
  type Lang,
  type CountryCode,
} from "@workspace/locale";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useQuery } from "@tanstack/react-query";
import { Check, Globe, Clock, ArrowLeft } from "lucide-react";

const signupSchema = z.object({
  companyName: z.string().min(1, "companyNameRequired"),
  name: z.string().min(1, "fullNameRequired"),
  phone: z.string().min(5, "phoneRequired").regex(/^\d[\d\s\-().]{4,18}$/, "phoneInvalid"),
  email: z.string().email("emailInvalid"),
  password: z.string().min(8, "passwordMin"),
  country: z.enum(COUNTRIES),
  baseCurrency: z.enum(CURRENCIES),
});

async function fetchPlanById(planId: string) {
  const res = await fetch(`/api/plans`);
  if (!res.ok) throw new Error("Failed to fetch plans");
  const plans = await res.json();
  return plans.find((p: any) => p.id === planId) || null;
}

export function Signup() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "ar") as Lang;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const signup = useSignup();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Read URL params
  const searchParams = new URLSearchParams(window.location.search);
  const urlPlanId = searchParams.get("plan");
  const urlCountry = searchParams.get("country") as CountryCode | null;
  const initialCountry = urlCountry && COUNTRIES.includes(urlCountry) ? urlCountry : "EG";
  const initialCurrency = COUNTRY_INFO[initialCountry]?.defaultCurrency || "EGP";

  const redirectForUser = (u: any) => {
    const isExpired = u.subscriptionStatus === "expired";
    const isTrialWithoutPlan = u.subscriptionStatus === "trial" && !u.planId;
    if (isExpired || isTrialWithoutPlan) return "/choose-plan";
    return "/dashboard";
  };

  React.useEffect(() => {
    if (user && !isUserLoading) {
      setLocation(redirectForUser(user));
    }
  }, [user, isUserLoading, setLocation]);

  const { data: selectedPlan } = useQuery({
    queryKey: ["selected-plan", urlPlanId],
    queryFn: () => (urlPlanId ? fetchPlanById(urlPlanId) : null),
    enabled: !!urlPlanId,
  });

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      country: initialCountry,
      baseCurrency: initialCurrency,
    },
  });

  const country = watch("country");
  const baseCurrency = watch("baseCurrency");

  const [phonePrefix, setPhonePrefix] = React.useState<string>(
    COUNTRY_INFO[initialCountry]?.dialCode ?? "+20"
  );

  const onSubmit = (data: z.infer<typeof signupSchema>) => {
    setErrorMsg(null);
    const localPhone = data.phone.replace(/^\s+|\s+$/g, "");
    const fullPhone = `${phonePrefix}${localPhone}`;
    const payload = { ...data, phone: fullPhone };
    if (urlPlanId) {
      (payload as any).planId = urlPlanId;
    }
    signup.mutate({ data: payload }, {
      onSuccess: (u: any) => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation(redirectForUser(u));
      },
      onError: (err: any) => {
        setErrorMsg(err?.data?.error || t("auth.signup.errorGeneric"));
      }
    });
  };

  if (isUserLoading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-sans relative">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md space-y-4">
        {/* Selected Plan Banner */}
        {selectedPlan && (
          <Card className="border-primary/30 bg-primary/5 shadow-sm">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  <Globe className="w-3 h-3 me-1" />
                  {selectedPlan.country}
                </Badge>
                <span className="text-sm text-muted-foreground">{selectedPlan.nameEn}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-primary">{selectedPlan.price}</span>
                <span className="text-muted-foreground">{selectedPlan.currency}</span>
                <span className="text-xs text-muted-foreground">/{selectedPlan.billingCycle === "monthly" ? "شهري" : selectedPlan.billingCycle === "quarterly" ? "ربع سنوي" : "سنوي"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>14 يوم تجربة مجانية — لا بطاقة ائتمان مطلوبة</span>
              </div>
              <div className="space-y-1">
                {(selectedPlan.features || []).slice(0, 3).map((f: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-3 h-3 text-primary" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setLocation("/")}
                className="text-sm text-primary font-semibold hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                تغيير الباقة
              </button>
            </div>
          </Card>
        )}

        <Card className="w-full max-w-md p-8 shadow-xl border-border">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-sm">
              ح
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground mb-1">{t("auth.signup.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("auth.signup.subtitle")}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {errorMsg && (
              <div className="p-3 text-sm font-semibold text-destructive bg-destructive/10 rounded-lg text-center">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="companyName">{t("auth.signup.companyName")}</Label>
              <Input
                id="companyName"
                placeholder={t("auth.signup.companyNamePlaceholder")}
                className="focus-visible:ring-primary"
                {...register("companyName")}
              />
              {errors.companyName && <span className="text-xs text-destructive">{t(`auth.validation.${errors.companyName.message}`)}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("auth.signup.fullName")}</Label>
              <Input
                id="name"
                placeholder={t("auth.signup.fullNamePlaceholder")}
                className="focus-visible:ring-primary"
                {...register("name")}
              />
              {errors.name && <span className="text-xs text-destructive">{t(`auth.validation.${errors.name.message}`)}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">{t("auth.signup.phone")}</Label>
              <div className="flex gap-2" dir="ltr">
                <select
                  value={phonePrefix}
                  onChange={(e) => setPhonePrefix(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 text-primary shrink-0"
                  style={{ minWidth: "72px" }}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={COUNTRY_INFO[c].dialCode}>
                      {COUNTRY_INFO[c].dialCode} {c}
                    </option>
                  ))}
                </select>
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  placeholder="1012345678"
                  className="text-start focus-visible:ring-primary flex-1"
                  {...register("phone")}
                />
              </div>
              {errors.phone && <span className="text-xs text-destructive">{t(`auth.validation.${errors.phone.message}`)}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("auth.signup.email")}</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                placeholder="name@company.com"
                className="text-start focus-visible:ring-primary"
                {...register("email")}
              />
              {errors.email && <span className="text-xs text-destructive">{t(`auth.validation.${errors.email.message}`)}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t("auth.signup.password")}</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                className="text-start focus-visible:ring-primary"
                {...register("password")}
              />
              {errors.password && <span className="text-xs text-destructive">{t(`auth.validation.${errors.password.message}`)}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t("auth.signup.country")}</Label>
                <Select
                  value={country}
                  onValueChange={(v) => {
                    setValue("country", v as typeof country);
                    const info = COUNTRY_INFO[v as keyof typeof COUNTRY_INFO];
                    if (info?.defaultCurrency) setValue("baseCurrency", info.defaultCurrency);
                    if (info?.dialCode) setPhonePrefix(info.dialCode);
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
                <Label>{t("auth.signup.baseCurrency")}</Label>
                <Select
                  value={baseCurrency}
                  onValueChange={(v) => setValue("baseCurrency", v as typeof baseCurrency)}
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
            </div>

            <Button type="submit" disabled={signup.isPending} className="w-full h-11 text-base font-bold mt-4 shadow-md hover:opacity-90">
              {signup.isPending ? t("auth.signup.submitting") : t("auth.signup.submit")}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            {t("auth.signup.haveAccount")}{" "}
            <Link href="/login" className="text-primary font-bold hover:underline">
              {t("auth.signup.login")}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
