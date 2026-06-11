import React from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Lock, ArrowLeft } from "lucide-react";

const resetSchema = z.object({
  password: z.string().min(8, "passwordMin"),
  confirmPassword: z.string().min(1, "passwordRequired"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "passwordMismatch",
  path: ["confirmPassword"],
});

export function ResetPassword() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [validating, setValidating] = React.useState(true);
  const [valid, setValid] = React.useState(false);

  const token = new URLSearchParams(window.location.search).get("token") || "";

  React.useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }
    fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        setValid(data.valid);
        setValidating(false);
      })
      .catch(() => {
        setValid(false);
        setValidating(false);
      });
  }, [token]);

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: z.infer<typeof resetSchema>) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: data.password }),
      });
      if (res.ok) {
        setSubmitted(true);
        toast({ title: t("auth.reset.success") });
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: body.error || t("auth.reset.error") });
      }
    } catch {
      toast({ variant: "destructive", title: t("auth.reset.error") });
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center text-muted-foreground">{t("auth.reset.validating")}</div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 font-sans relative">
        <div className="absolute top-4 end-4">
          <LanguageSwitcher />
        </div>
        <Card className="w-full max-w-md p-8 shadow-xl border-border text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">{t("auth.reset.invalidTitle")}</h1>
          <p className="text-sm text-muted-foreground mb-6">{t("auth.reset.invalidBody")}</p>
          <Link href="/forgot-password" className="inline-flex items-center gap-2 text-primary font-semibold hover:underline">
            <ArrowLeft className="w-4 h-4" />
            {t("auth.reset.requestNew")}
          </Link>
        </Card>
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold text-foreground mb-1">{t("auth.reset.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.reset.subtitle")}</p>
          </div>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 text-center py-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-success" />
            </div>
            <p className="text-foreground font-semibold">{t("auth.reset.doneTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("auth.reset.doneBody")}</p>
            <Link href="/login" className="inline-flex items-center gap-2 text-primary font-semibold hover:underline mt-4">
              {t("auth.reset.login")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t("auth.reset.password")}</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                className="text-start focus-visible:ring-primary"
                {...register("password")}
              />
              {errors.password && <span className="text-xs text-destructive">{t(`auth.validation.${errors.password.message}`)}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">{t("auth.reset.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                dir="ltr"
                className="text-start focus-visible:ring-primary"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && <span className="text-xs text-destructive">{t(`auth.validation.${errors.confirmPassword.message}`)}</span>}
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 text-base font-bold mt-2 shadow-md hover:opacity-90">
              {loading ? t("auth.reset.submitting") : t("auth.reset.submit")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
