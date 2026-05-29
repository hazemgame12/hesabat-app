import { Link, useLocation } from "wouter";
import { LogOut, Globe, FileText, Briefcase, Package, Users, Settings, LayoutDashboard, BookOpen, Sparkles, CalendarDays, Share2, Link2 } from "lucide-react";
import { clearAdminToken } from "@/lib/api";
import logo from "@assets/hg-logo.png";

const navItems = [
  { href: "/admin/dashboard", icon: LayoutDashboard, label: "الرئيسية" },
  { href: "/admin/studio", icon: Sparkles, label: "استوديو المحتوى" },
  { href: "/admin/content-calendar", icon: CalendarDays, label: "تقويم المحتوى" },
  { href: "/admin/social-posts", icon: Share2, label: "السوشيال ميديا" },
  { href: "/admin/social-connections", icon: Link2, label: "ربط المنصات" },
  { href: "/admin/articles", icon: FileText, label: "المقالات" },
  { href: "/admin/services", icon: Briefcase, label: "الخدمات" },
  { href: "/admin/packages", icon: Package, label: "الباقات" },
  { href: "/admin/case-studies", icon: BookOpen, label: "دراسات الحالة" },
  { href: "/admin/leads", icon: Users, label: "العملاء المحتملون" },
  { href: "/admin/settings", icon: Settings, label: "إعدادات الموقع" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const [location, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleLogout = () => {
    clearAdminToken();
    navigate(`${base}/admin`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-[#001d56] flex flex-col flex-shrink-0 fixed inset-y-0 right-0 z-40">
        <div className="p-6 border-b border-white/10">
          <img src={logo} alt="HG" className="h-10 object-contain" />
          <p className="text-white/50 text-xs mt-2">لوحة التحكم</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const fullHref = `${base}${item.href}`;
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={fullHref}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <Link
            href={`${base}/`}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 text-sm transition-all"
          >
            <Globe className="w-4 h-4" />
            عرض الموقع
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/60 hover:text-red-400 hover:bg-red-500/10 text-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 mr-64 min-h-screen">
        {title && (
          <header className="bg-white border-b border-gray-100 px-8 py-5 sticky top-0 z-30 shadow-sm">
            <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          </header>
        )}
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
