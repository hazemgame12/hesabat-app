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
} from "@workspace/locale";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const signupSchema = z.object({
  companyName: z.string().min(1, "companyNameRequired"),
  name: z.string().min(1, "fullNameRequired"),
  email: z.string().email("emailInvalid"),
  password: z.string().min(8, "passwordMin"),
  country: z.enum(COUNTRIES),
  baseCurrency: z.enum(CURRENCIES),
});

export function Signup() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "ar") as Lang;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const signup = useSignup();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

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

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      country: "EG",
      baseCurrency: "EGP",
    },
  });

  const country = watch("country");
  const baseCurrency = watch("baseCurrency");

  const onSubmit = (data: z.infer<typeof signupSchema>) => {
    setErrorMsg(null);
    signup.mutate({ data }, {
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
                  const def = COUNTRY_INFO[v as keyof typeof COUNTRY_INFO]?.defaultCurrency;
                  if (def) setValue("baseCurrency", def);
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
  );
}
