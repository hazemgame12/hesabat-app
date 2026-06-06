import React from "react";
import { useLocation, useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import {
  useGetInvitation,
  useAcceptInvitation,
  getGetInvitationQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { type RoleId } from "@workspace/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const acceptSchema = z.object({
  name: z.string().min(1, "fullNameRequired"),
  password: z.string().min(8, "passwordMin"),
});

export function AcceptInvite() {
  const { t } = useTranslation();
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: invite, isLoading, isError } = useGetInvitation(token, {
    query: { enabled: !!token, queryKey: getGetInvitationQueryKey(token) },
  });
  const accept = useAcceptInvitation();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof acceptSchema>>({
    resolver: zodResolver(acceptSchema),
  });

  const onSubmit = (data: z.infer<typeof acceptSchema>) => {
    setErrorMsg(null);
    accept.mutate({ token, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        setErrorMsg(err?.data?.error || t("auth.accept.errorGeneric"));
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground font-medium text-sm">{t("auth.accept.loading")}</p>
        </div>
      </div>
    );
  }

  if (isError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 font-sans relative">
        <div className="absolute top-4 end-4">
          <LanguageSwitcher />
        </div>
        <Card className="w-full max-w-md p-8 shadow-xl border-border text-center flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto font-bold text-2xl">
            !
          </div>
          <h1 className="text-xl font-bold text-foreground">{t("auth.accept.invalidTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("auth.accept.invalidBody")}
          </p>
          <Button onClick={() => setLocation("/login")} className="w-full h-11 font-bold mt-2">
            {t("auth.accept.login")}
          </Button>
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
            <h1 className="text-2xl font-bold text-foreground mb-1">{t("auth.accept.joinTitle", { company: invite.companyName })}</h1>
            <p className="text-sm text-muted-foreground">
              {t("auth.accept.invitedAs")}{" "}
              <span className="font-bold text-foreground">{t(`roles.${invite.role as RoleId}.label`, { defaultValue: invite.role })}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 text-sm font-semibold text-destructive bg-destructive/10 rounded-lg text-center">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.accept.email")}</Label>
            <Input id="email" type="email" dir="ltr" value={invite.email} readOnly disabled className="text-start bg-muted" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t("auth.accept.fullName")}</Label>
            <Input id="name" placeholder={t("auth.accept.fullNamePlaceholder")} className="focus-visible:ring-primary" {...register("name")} />
            {errors.name && <span className="text-xs text-destructive">{t(`auth.validation.${errors.name.message}`)}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth.accept.password")}</Label>
            <Input id="password" type="password" dir="ltr" className="text-start focus-visible:ring-primary" {...register("password")} />
            {errors.password && <span className="text-xs text-destructive">{t(`auth.validation.${errors.password.message}`)}</span>}
          </div>

          <Button type="submit" disabled={accept.isPending} className="w-full h-11 text-base font-bold mt-4 shadow-md hover:opacity-90">
            {accept.isPending ? t("auth.accept.submitting") : t("auth.accept.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
