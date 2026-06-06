import React from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSignup, useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

const signupSchema = z.object({
  companyName: z.string().min(1, "اسم الشركة مطلوب"),
  name: z.string().min(1, "الاسم الكامل مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

export function Signup() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const signup = useSignup();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user && !isUserLoading) {
      setLocation("/dashboard");
    }
  }, [user, isUserLoading, setLocation]);

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = (data: z.infer<typeof signupSchema>) => {
    setErrorMsg(null);
    signup.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        setErrorMsg(err?.data?.error || "حدث خطأ أثناء التسجيل");
      }
    });
  };

  if (isUserLoading) return null;

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-4 font-sans">
      <Card className="w-full max-w-md p-8 shadow-xl border-border">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-sm">
            ح
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-1">تسجيل شركة جديدة</h1>
            <p className="text-sm text-muted-foreground">أنشئ حسابك وابدأ في إدارة حساباتك</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 text-sm font-semibold text-destructive bg-destructive/10 rounded-lg text-center">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="companyName">اسم الشركة</Label>
            <Input
              id="companyName"
              placeholder="مثال: شركة النيل للتجارة"
              className="focus-visible:ring-primary"
              {...register("companyName")}
            />
            {errors.companyName && <span className="text-xs text-destructive">{errors.companyName.message}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">الاسم الكامل</Label>
            <Input
              id="name"
              placeholder="الاسم الثلاثي"
              className="focus-visible:ring-primary"
              {...register("name")}
            />
            {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              placeholder="name@company.com"
              className="text-right focus-visible:ring-primary"
              {...register("email")}
            />
            {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              className="text-right focus-visible:ring-primary"
              {...register("password")}
            />
            {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
          </div>

          <Button type="submit" disabled={signup.isPending} className="w-full h-11 text-base font-bold mt-4 shadow-md hover:opacity-90">
            {signup.isPending ? "جاري التسجيل..." : "إنشاء حساب"}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="text-primary font-bold hover:underline">
            تسجيل الدخول
          </Link>
        </div>
      </Card>
    </div>
  );
}