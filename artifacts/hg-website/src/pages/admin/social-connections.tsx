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
  adminDisconnectSocial, adminFetchSocialConnections, adminGetSocialOAuthUrl,
  adminSaveSocialConnection, clearAdminToken, getAdminToken,
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
  const [connecting, setConnecting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [formError, setFormError] = useState("");

  const connectOAuth = async () => {
    setConnecting(true); setFormError("");
    try {
      const url = await adminGetSocialOAuthUrl(token, conn.platform);
      window.location.href = url;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذّر بدء الربط");
      setConnecting(false);
    }
  };

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

  const daysUntil = (iso: string): number => {
    const ms = Date.parse(iso) - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  };

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

      {conn.expiryStatus === "expired" && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>انتهت صلاحية رمز الوصول — أعد الربط لاستئناف النشر التلقائي.</span>
        </div>
      )}
      {conn.expiryStatus === "expiring_soon" && conn.tokenExpiresAt && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            تنتهي صلاحية الربط خلال {daysUntil(conn.tokenExpiresAt)} يوم — يُفضّل إعادة الربط لتفادي توقف النشر.
          </span>
        </div>
      )}

      {conn.oauthAvailable && (
        <div className="mt-3">
          <Button onClick={connectOAuth} disabled={connecting} className="gap-2 w-full sm:w-auto">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <meta.icon className="w-4 h-4" />}
            {hasStored ? `إعادة الربط مع ${meta.label}` : `الربط مع ${meta.label} بنقرة واحدة`}
          </Button>
          <p className="text-xs text-gray-400 mt-1.5">
            ستتم إعادة توجيهك لتسجيل الدخول والموافقة، ثم نلتقط رمز وصول طويل الأمد تلقائياً.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        className="text-xs text-gray-500 underline mt-3 hover:text-gray-700"
      >
        {showManual ? "إخفاء الإدخال اليدوي" : "إدخال المفاتيح يدوياً (متقدم)"}
      </button>

      {(showManual || !conn.oauthAvailable) && (
        <>
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

          <div className="flex items-center gap-2 mt-4">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {hasStored ? "تحديث الربط" : "ربط الحساب"}
            </Button>
          </div>
        </>
      )}

      {formError && <p className="text-sm text-red-600 mt-3 break-words">{formError}</p>}

      {hasStored && (
        <div className="flex items-center gap-2 mt-4">
          <Button variant="outline" onClick={disconnect} disabled={disconnecting} className="gap-2">
            {disconnecting && <Loader2 className="w-4 h-4 animate-spin" />}
            فصل الربط
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminSocialConnections() {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();
  const [conns, setConns] = useState<SocialConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = () => {
    if (!token) { navigate(`${base}/admin`); return; }
    setLoading(true);
    adminFetchSocialConnections(token)
      .then(setConns)
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const socialError = params.get("social_error");
    if (connected) {
      const label = platformMeta[connected as SocialPlatform]?.label ?? connected;
      setBanner({ type: "success", text: `تم ربط ${label} بنجاح.` });
    } else if (socialError) {
      setBanner({ type: "error", text: `تعذّر إكمال الربط: ${socialError}` });
    }
    if (connected || socialError) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    load();
  }, []);

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

      {banner && (
        <div
          className={`mb-4 rounded-2xl border p-4 text-sm ${
            banner.type === "success"
              ? "bg-green-50 border-green-100 text-green-800"
              : "bg-red-50 border-red-100 text-red-800"
          }`}
        >
          {banner.text}
        </div>
      )}

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
