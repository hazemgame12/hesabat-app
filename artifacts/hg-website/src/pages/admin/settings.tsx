import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Save, Eye, EyeOff } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getAdminToken, clearAdminToken } from "@/lib/api";

type Settings = Record<string, string>;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <h2 className="font-bold text-gray-800 text-base border-b pb-3">{title}</h2>
      {children}
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 pr-10"
        dir="ltr"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function AdminSettings() {
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Settings) => setSettings(data))
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, []);

  const set = (key: string, val: string) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        setError("حدث خطأ أثناء الحفظ");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLayout title="إعدادات الموقع"><div className="text-center py-20 text-gray-400">جاري التحميل...</div></AdminLayout>;

  return (
    <AdminLayout title="إعدادات الموقع">
      <div className="max-w-3xl space-y-6">

        <Section title="🏷️ هوية الموقع">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="اسم الموقع (عربي)">
              <Input value={settings.site_name_ar || ""} onChange={e => set("site_name_ar", e.target.value)} className="h-10" />
            </Field>
            <Field label="اسم الموقع (إنجليزي)">
              <Input value={settings.site_name_en || ""} onChange={e => set("site_name_en", e.target.value)} className="h-10" dir="ltr" />
            </Field>
          </div>
          <Field label="الوصف (عربي)">
            <Textarea value={settings.tagline_ar || ""} onChange={e => set("tagline_ar", e.target.value)} rows={2} />
          </Field>
          <Field label="الوصف (إنجليزي)">
            <Textarea value={settings.tagline_en || ""} onChange={e => set("tagline_en", e.target.value)} rows={2} dir="ltr" />
          </Field>
        </Section>

        <Section title="📞 معلومات التواصل">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="رقم الهاتف">
              <Input value={settings.phone || ""} onChange={e => set("phone", e.target.value)} className="h-10" dir="ltr" />
            </Field>
            <Field label="واتساب (مع كود الدولة)">
              <Input value={settings.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)} placeholder="201025812666" className="h-10" dir="ltr" />
            </Field>
            <Field label="البريد الإلكتروني (للعرض)">
              <Input value={settings.email || ""} onChange={e => set("email", e.target.value)} className="h-10" dir="ltr" />
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="العنوان (عربي)">
              <Input value={settings.address_ar || ""} onChange={e => set("address_ar", e.target.value)} className="h-10" />
            </Field>
            <Field label="العنوان (إنجليزي)">
              <Input value={settings.address_en || ""} onChange={e => set("address_en", e.target.value)} className="h-10" dir="ltr" />
            </Field>
          </div>
        </Section>

        <Section title="📱 روابط السوشيال ميديا">
          <Field label="فيسبوك">
            <Input value={settings.facebook || ""} onChange={e => set("facebook", e.target.value)} className="h-10" dir="ltr" />
          </Field>
          <Field label="إنستجرام">
            <Input value={settings.instagram || ""} onChange={e => set("instagram", e.target.value)} className="h-10" dir="ltr" />
          </Field>
          <Field label="لينكدإن">
            <Input value={settings.linkedin || ""} onChange={e => set("linkedin", e.target.value)} className="h-10" dir="ltr" />
          </Field>
        </Section>

        <Section title="🤖 إعدادات الذكاء الاصطناعي (Gemini)">
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800 mb-2">
            مفتاح Gemini API يُستخدم في استوديو المحتوى لتوليد المقالات ومنشورات السوشيال ميديا تلقائياً.
            احصل على مفتاح مجاني من{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
              Google AI Studio
            </a>.
          </div>
          <Field
            label="Gemini API Key"
            hint="يُحفظ مشفّراً في قاعدة البيانات. اتركه فارغاً إذا كنت تستخدم متغير البيئة GEMINI_API_KEY على الخادم."
          >
            <SecretInput
              value={settings.gemini_api_key || ""}
              onChange={v => set("gemini_api_key", v)}
              placeholder="AIzaSy..."
            />
          </Field>
        </Section>

        <Section title="📧 إعدادات البريد الإلكتروني (SMTP)">
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800 mb-2">
            يُستخدم لإرسال إشعارات الطلبات الجديدة من الموقع إلى بريدك. تأكد من إدخال بيانات SMTP الصحيحة.
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="SMTP Host" hint="مثال: mail.hg-audit.com">
              <Input value={settings.smtp_host || ""} onChange={e => set("smtp_host", e.target.value)} className="h-10" dir="ltr" placeholder="mail.hg-audit.com" />
            </Field>
            <Field label="SMTP Port" hint="465 (SSL) أو 587 (TLS)">
              <Input value={settings.smtp_port || "465"} onChange={e => set("smtp_port", e.target.value)} className="h-10" dir="ltr" placeholder="465" />
            </Field>
            <Field label="اسم المستخدم (البريد)">
              <Input value={settings.smtp_user || ""} onChange={e => set("smtp_user", e.target.value)} className="h-10" dir="ltr" placeholder="info@hg-audit.com" />
            </Field>
            <Field label="كلمة مرور البريد">
              <SecretInput
                value={settings.smtp_pass || ""}
                onChange={v => set("smtp_pass", v)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="بريد المُرسِل (From)" hint="يظهر كمُرسِل في الإيميل">
              <Input value={settings.smtp_from || ""} onChange={e => set("smtp_from", e.target.value)} className="h-10" dir="ltr" placeholder="info@hg-audit.com" />
            </Field>
            <Field label="إرسال الإشعارات إلى" hint="البريد الذي يستقبل طلبات العملاء الجديدة">
              <Input value={settings.lead_notification_to || ""} onChange={e => set("lead_notification_to", e.target.value)} className="h-10" dir="ltr" placeholder="admin@hg-audit.com" />
            </Field>
          </div>
        </Section>

        <Section title="🔍 SEO عام">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Meta Title (عربي)">
              <Input value={settings.meta_title_ar || ""} onChange={e => set("meta_title_ar", e.target.value)} className="h-10" />
            </Field>
            <Field label="Meta Title (إنجليزي)">
              <Input value={settings.meta_title_en || ""} onChange={e => set("meta_title_en", e.target.value)} className="h-10" dir="ltr" />
            </Field>
          </div>
          <Field label="Meta Description (عربي)">
            <Textarea value={settings.meta_description_ar || ""} onChange={e => set("meta_description_ar", e.target.value)} rows={2} />
          </Field>
          <Field label="Meta Description (إنجليزي)">
            <Textarea value={settings.meta_description_en || ""} onChange={e => set("meta_description_en", e.target.value)} rows={2} dir="ltr" />
          </Field>
        </Section>

        <Section title="📊 التتبع والتحليلات">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Google Analytics ID">
              <Input value={settings.google_analytics_id || ""} onChange={e => set("google_analytics_id", e.target.value)} placeholder="G-XXXXXXXXXX" className="h-10" dir="ltr" />
            </Field>
            <Field label="Meta Pixel ID">
              <Input value={settings.meta_pixel_id || ""} onChange={e => set("meta_pixel_id", e.target.value)} placeholder="XXXXXXXXXXXXXXXXXX" className="h-10" dir="ltr" />
            </Field>
          </div>
        </Section>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button onClick={handleSave} className="w-full h-12 text-base gap-2" disabled={saving}>
          <Save className="w-5 h-5" />
          {saved ? "✓ تم الحفظ بنجاح!" : saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </div>
    </AdminLayout>
  );
}
