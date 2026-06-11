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
import { Mail, ArrowLeft } from "lucide-react";

const forgotSchema = z.object({
  email: z.string().email("emailInvalid"),
});

export function ForgotPassword() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: z.infer<typeof forgotSchema>) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      if (res.ok) {
        setSubmitted(true);
        toast({ title: t("auth.forgot.success") });
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: body.error || t("auth.forgot.error") });
      }
    } catch {
      toast({ variant: "destructive", title: t("auth.forgot.error") });
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className="text-2xl font-bold text-foreground mb-1">{t("auth.forgot.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.forgot.subtitle")}</p>
          </div>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 text-center py-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <Mail className="w-8 h-8 text-success" />
            </div>
            <p className="text-foreground font-semibold">{t("auth.forgot.sentTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("auth.forgot.sentBody")}</p>
            <Link href="/login" className="flex items-center gap-2 text-sm text-primary font-semibold hover:underline mt-4">
              <ArrowLeft className="w-4 h-4" />
              {t("auth.forgot.backToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("auth.forgot.email")}</Label>
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

            <Button type="submit" disabled={loading} className="w-full h-11 text-base font-bold mt-2 shadow-md hover:opacity-90">
              {loading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
            </Button>

            <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-primary font-semibold hover:underline mt-2">
              <ArrowLeft className="w-4 h-4" />
              {t("auth.forgot.backToLogin")}
            </Link>
          </form>
        )}
      </Card>
    </div>
  );
}
