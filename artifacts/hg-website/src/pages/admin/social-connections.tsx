import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Facebook, Instagram, Linkedin, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminLayout from "@/components/admin-layout";
import {
  adminDisconnectSocial, adminFetchSocialConnections, adminSaveSocialConnection,
  clearAdminToken, getAdminToken,
  type SocialConnectionStatus, type SocialPlatform,
} from "@/lib/api";

const platformMeta: Record<SocialPlatform, { icon: typeof Facebook; label: string; color: string }> = {
  facebook: { icon: Facebook, label: "صفحة فيسبوك", color: "text-blue-600" },
  instagram: { icon: Instagram, label: "إنستجرام (حساب أعمال)", color: "text-pink-600" },
  linkedin: { icon: Linkedin, label: "صفحة لينكدإن", color: "text-sky-700" },
};

function ConnectionCard({
  conn, token, onUpdated,
}: {
  conn: SocialConnectionStatus;
  token: string;
  onUpdated: (s: SocialConnectionStatus) => void;
}) {
  const meta = platformMeta[conn.platform];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [formError, setFormError] = useState("");

  const save = async () => {
    setSaving(true); setFormError("");
    try {
      const updated = await adminSaveSocialConnection(token, conn.platform, values);
      onUpdated(updated);
      setValues({});
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    setDisconnecting(true); setFormError("");
    try {
      const updated = await adminDisconnectSocial(token, conn.platform);
      onUpdated(updated);
      setValues({});
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذّر فصل الربط");
    } finally { setDisconnecting(false); }
  };

  const hasStored = conn.source === "stored";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <meta.icon className={`w-6 h-6 ${meta.color}`} />
          {meta.label}
        </div>
        {conn.connected ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700">
            <CheckCircle2 className="w-4 h-4" /> متصل
          </span>
        ) : conn.configured ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="w-4 h-4" /> يحتاج مراجعة
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-500">
            <XCircle className="w-4 h-4" /> غير مربوط
          </span>
        )}
      </div>

      {conn.connected && conn.accountName && (
        <p className="text-sm text-gray-600 mb-2" dir="ltr">{conn.accountName}</p>
      )}
      {conn.source === "env" && (
        <p className="text-xs text-gray-400 mb-2">المصدر: متغيرات البيئة (Environment Secrets)</p>
      )}
      {conn.error && (
        <p className="text-sm text-red-600 mb-2 break-words" dir="ltr">{conn.error}</p>
      )}

      <div className="space-y-3 mt-3">
        {conn.fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`${conn.platform}-${f.key}`} className="text-sm text-gray-700">
              {f.label}
              {f.required && <span className="text-red-500"> *</span>}
            </Label>
            <Input
              id={`${conn.platform}-${f.key}`}
              type={f.secret ? "password" : "text"}
              dir="ltr"
              value={values[f.key] ?? ""}
              placeholder={f.hasValue ? (f.secret ? "•••••••• (محفوظ — اتركه فارغاً للإبقاء)" : "محفوظ — اتركه فارغاً للإبقاء") : ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {formError && <p className="text-sm text-red-600 mt-3 break-words">{formError}</p>}

      <div className="flex items-center gap-2 mt-4">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {hasStored ? "تحديث الربط" : "ربط الحساب"}
        </Button>
        {hasStored && (
          <Button variant="outline" onClick={disconnect} disabled={disconnecting} className="gap-2">
            {disconnecting && <Loader2 className="w-4 h-4 animate-spin" />}
            فصل الربط
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminSocialConnections() {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();
  const [conns, setConns] = useState<SocialConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) { navigate(`${base}/admin`); return; }
    setLoading(true);
    adminFetchSocialConnections(token)
      .then(setConns)
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const updateOne = (s: SocialConnectionStatus) =>
    setConns((prev) => prev.map((c) => (c.platform === s.platform ? s : c)));

  return (
    <AdminLayout title="ربط منصات التواصل">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500 text-sm max-w-2xl">
          اربط صفحات الشركة لنشر المنشورات المجدولة تلقائياً. تُحفظ مفاتيح الوصول مشفّرة على الخادم
          (AES‑256) ولا تُخزَّن في قاعدة البيانات كنص صريح. يمكن أيضاً ضبطها عبر متغيرات البيئة.
        </p>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2 h-10">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">جاري التحميل...</div>
      ) : (
        <div className="grid gap-4">
          {token && conns.map((c) => (
            <ConnectionCard key={c.platform} conn={c} token={token} onUpdated={updateOne} />
          ))}
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">ملاحظة عن الموافقات الخارجية</p>
        <p className="leading-relaxed">
          النشر التلقائي يتطلب موافقات مسبقة من المنصات: تطبيق Meta موثّق (Business Verification + App Review)
          لصلاحيات النشر، وحساب إنستجرام أعمال مرتبط بصفحة فيسبوك، وموافقة LinkedIn Marketing Developer Platform.
          هذه الموافقات خارج تحكّمنا وقد تستغرق وقتاً.
        </p>
      </div>
    </AdminLayout>
  );
}
