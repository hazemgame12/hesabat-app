import React from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const loginSchema = z.object({
  email: z.string().email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});

export function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const login = useLogin();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user && !isUserLoading) {
      setLocation("/dashboard");
    }
  }, [user, isUserLoading, setLocation]);

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    setErrorMsg(null);
    login.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        setErrorMsg(err?.data?.error || t("auth.login.errorGeneric"));
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
            <h1 className="text-2xl font-bold text-foreground mb-1">{t("auth.login.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {errorMsg && (
            <div className="p-3 text-sm font-semibold text-destructive bg-destructive/10 rounded-lg text-center">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.login.email")}</Label>
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
            <div className="flex justify-between items-center">
              <Label htmlFor="password">{t("auth.login.password")}</Label>
              <Link href="#" className="text-xs text-primary font-semibold hover:underline">{t("auth.login.forgotPassword")}</Link>
            </div>
            <Input
              id="password"
              type="password"
              dir="ltr"
              className="text-start focus-visible:ring-primary"
              {...register("password")}
            />
            {errors.password && <span className="text-xs text-destructive">{t(`auth.validation.${errors.password.message}`)}</span>}
          </div>

          <Button type="submit" disabled={login.isPending} className="w-full h-11 text-base font-bold mt-2 shadow-md hover:opacity-90">
            {login.isPending ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          {t("auth.login.noAccount")}{" "}
          <Link href="/signup" className="text-primary font-bold hover:underline">
            {t("auth.login.createAccount")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
