import React from "react";
import { useLocation, useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetInvitation,
  useAcceptInvitation,
  getGetInvitationQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS, type RoleId } from "@workspace/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

const acceptSchema = z.object({
  name: z.string().min(1, "الاسم الكامل مطلوب"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

function roleLabel(role: string): string {
  return ROLE_LABELS[role as RoleId] ?? role;
}

export function AcceptInvite() {
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
        setErrorMsg(err?.data?.error || "حدث خطأ أثناء قبول الدعوة");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground font-medium text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (isError || !invite) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-4 font-sans">
        <Card className="w-full max-w-md p-8 shadow-xl border-border text-center flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto font-bold text-2xl">
            !
          </div>
          <h1 className="text-xl font-bold text-foreground">الدعوة غير صالحة</h1>
          <p className="text-sm text-muted-foreground">
            هذا الرابط غير صحيح أو انتهت صلاحيته. تواصل مع مدير شركتك لإرسال دعوة جديدة.
          </p>
          <Button onClick={() => setLocation("/login")} className="w-full h-11 font-bold mt-2">
            تسجيل الدخول
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-4 font-sans">
      <Card className="w-full max-w-md p-8 shadow-xl border-border">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-sm">
            ح
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-1">انضم إلى {invite.companyName}</h1>
            <p className="text-sm text-muted-foreground">
              دُعيت للانضمام بصفة <span className="font-bold text-foreground">{roleLabel(invite.role)}</span>
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
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input id="email" type="email" dir="ltr" value={invite.email} readOnly disabled className="text-right bg-muted" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">الاسم الكامل</Label>
            <Input id="name" placeholder="الاسم الثلاثي" className="focus-visible:ring-primary" {...register("name")} />
            {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input id="password" type="password" dir="ltr" className="text-right focus-visible:ring-primary" {...register("password")} />
            {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
          </div>

          <Button type="submit" disabled={accept.isPending} className="w-full h-11 text-base font-bold mt-4 shadow-md hover:opacity-90">
            {accept.isPending ? "جاري الإنشاء..." : "إنشاء الحساب والانضمام"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
