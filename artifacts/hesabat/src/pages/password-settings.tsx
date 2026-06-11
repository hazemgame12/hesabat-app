import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Lock } from "lucide-react";

const changeSchema = z.object({
  currentPassword: z.string().min(1, "passwordRequired"),
  newPassword: z.string().min(8, "passwordMin"),
  confirmPassword: z.string().min(1, "passwordRequired"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "passwordMismatch",
  path: ["confirmPassword"],
});

export function PasswordSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof changeSchema>>({
    resolver: zodResolver(changeSchema),
  });

  const onSubmit = async (data: z.infer<typeof changeSchema>) => {
    setLoading(true);
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
        toast({ title: t("settings.password.success") });
        reset();
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: body.error || t("settings.password.error") });
      }
    } catch {
      toast({ variant: "destructive", title: t("settings.password.error") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-xl">
      <Card className="p-6 shadow-sm border-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("settings.password.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("settings.password.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="currentPassword">{t("settings.password.current")}</Label>
            <Input
              id="currentPassword"
              type="password"
              dir="ltr"
              className="text-start focus-visible:ring-primary"
              {...register("currentPassword")}
            />
            {errors.currentPassword && <span className="text-xs text-destructive">{t(`auth.validation.${errors.currentPassword.message}`)}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">{t("settings.password.new")}</Label>
            <Input
              id="newPassword"
              type="password"
              dir="ltr"
              className="text-start focus-visible:ring-primary"
              {...register("newPassword")}
            />
            {errors.newPassword && <span className="text-xs text-destructive">{t(`auth.validation.${errors.newPassword.message}`)}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">{t("settings.password.confirm")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              dir="ltr"
              className="text-start focus-visible:ring-primary"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && <span className="text-xs text-destructive">{t(`auth.validation.${errors.confirmPassword.message}`)}</span>}
          </div>

          <Button type="submit" disabled={loading} className="w-fit h-10 text-sm font-bold mt-2 shadow-md hover:opacity-90">
            {loading ? t("settings.password.changing") : t("settings.password.change")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
