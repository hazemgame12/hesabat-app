import { useState } from "react";
import { useLocation } from "wouter";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminLogin, setAdminToken } from "@/lib/api";
import logo from "@assets/hg-logo.png";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await adminLogin(password);
      setAdminToken(token);
      navigate(`${base}/admin/articles`);
    } catch (err) {
      setError("كلمة المرور غير صحيحة");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#001d56] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="HG" className="h-14 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-[#001d56]">لوحة التحكم</h1>
          <p className="text-gray-500 text-sm mt-1">سجّل دخولك للمتابعة</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5" dir="rtl">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">كلمة المرور</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="h-12 pr-10 text-right"
                required
                autoFocus
              />
            </div>
          </div>
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg text-center font-medium">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading}>
            {loading ? "جاري التحقق..." : "دخول"}
          </Button>
        </form>
      </div>
    </div>
  );
}
