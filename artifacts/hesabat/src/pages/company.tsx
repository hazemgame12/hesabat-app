import React from "react";
import { useForm } from "react-hook-form";
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
  CURRENCY_INFO,
  countryLabel,
  currencyLabel,
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
import { Building2, Upload, Globe, Coins, ImageOff } from "lucide-react";

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
  const { data: user } = useGetCurrentUser();
  const canEdit = hasCapability(user?.role ?? "", "company:manage");
  const { data: company, isLoading } = useGetCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateCompany = useUpdateCompany();
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
    if (company) reset(toForm(company));
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
          toast({ title: "تم حفظ بيانات الشركة بنجاح" });
        },
        onError: (err: any) => {
          toast({
            title: err?.data?.error || "تعذّر حفظ البيانات",
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
        throw new Error(body?.error || "تعذّر رفع الشعار");
      }
      await queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey() });
      toast({ title: "تم تحديث شعار الشركة" });
    } catch (err: any) {
      toast({ title: err?.message || "تعذّر رفع الشعار", variant: "destructive" });
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
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center px-8">
        <div>
          <h1 className="text-lg font-bold text-foreground">بيانات الشركة</h1>
          <p className="text-sm text-muted-foreground font-medium">
            الملف التعريفي للشركة وبيانات التسجيل والعملة
          </p>
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full">
        {/* Logo + identity */}
        <Card className="p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-28 h-28 rounded-2xl bg-muted border flex items-center justify-center overflow-hidden shrink-0">
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt="شعار الشركة"
                className="w-full h-full object-contain"
              />
            ) : (
              <ImageOff className="w-10 h-10 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 text-center sm:text-right">
            <h2 className="text-xl font-bold">{company?.name}</h2>
            {company?.tradeName && (
              <p className="text-sm text-muted-foreground mt-1">
                الاسم التجاري: {company.tradeName}
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-3">
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/5 text-primary px-3 py-1 rounded-full">
                <Globe className="w-3.5 h-3.5" />
                {countryLabel(company?.country ?? "EG")}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-success/10 text-success px-3 py-1 rounded-full">
                <Coins className="w-3.5 h-3.5" />
                {currencyLabel(company?.baseCurrency ?? "EGP")}
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
                {company?.logoUrl ? "تغيير الشعار" : "رفع الشعار"}
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
            <h2 className="text-lg font-bold">تفاصيل الشركة</h2>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">اسم الشركة</Label>
              <Input id="name" disabled={!canEdit} {...register("name")} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tradeName">الاسم التجاري</Label>
              <Input
                id="tradeName"
                disabled={!canEdit}
                placeholder="الاسم التجاري المسجّل"
                {...register("tradeName")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="taxRegistrationNumber">رقم التسجيل الضريبي</Label>
              <Input
                id="taxRegistrationNumber"
                dir="ltr"
                className="text-right"
                disabled={!canEdit}
                placeholder="مثال: 123-456-789"
                {...register("taxRegistrationNumber")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                id="phone"
                dir="ltr"
                className="text-right"
                disabled={!canEdit}
                {...register("phone")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>الدولة</Label>
              <Select
                value={country}
                disabled={!canEdit}
                onValueChange={(v) => {
                  setValue("country", v);
                  const def = COUNTRY_INFO[v as keyof typeof COUNTRY_INFO]
                    ?.defaultCurrency;
                  if (def) setValue("baseCurrency", def);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {COUNTRY_INFO[c].nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>العملة الأساسية</Label>
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
                      {CURRENCY_INFO[c].nameAr} ({c})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="activityDescription">وصف النشاط</Label>
              <Textarea
                id="activityDescription"
                rows={2}
                disabled={!canEdit}
                placeholder="مثال: تجارة الأجهزة الكهربائية بالجملة"
                {...register("activityDescription")}
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="address">العنوان</Label>
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
                  {updateCompany.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
                </Button>
              </div>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
