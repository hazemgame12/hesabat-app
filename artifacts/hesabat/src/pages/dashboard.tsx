import React from "react";
import { useGetDashboardSummary, useGetCurrentUser } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Building2, ListTree, Activity, Hash, Tag, PieChart as PieChartIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Spinner } from "@/components/ui/spinner";

const COLORS = {
  asset: "hsl(var(--primary))",
  liability: "hsl(var(--destructive))",
  equity: "hsl(var(--secondary-foreground))",
  revenue: "hsl(var(--success))",
  expense: "hsl(var(--chart-4))",
};

const typeLabels: Record<string, string> = {
  asset: "الأصول",
  liability: "الخصوم",
  equity: "حقوق الملكية",
  revenue: "الإيرادات",
  expense: "المصروفات",
};

export function Dashboard() {
  const { data: user } = useGetCurrentUser();
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const chartData = summary?.accountsByType?.map(item => ({
    name: typeLabels[item.type] || item.type,
    value: item.count,
    color: COLORS[item.type as keyof typeof COLORS] || "hsl(var(--muted-foreground))"
  })) || [];

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{user?.companyName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <span className="text-success flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                متصل بالنظام
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Top KPIs Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-5 flex flex-col gap-4 group hover:border-primary/30 transition-colors relative overflow-hidden">
            <div className="flex justify-between items-start relative z-10">
              <div className="bg-primary/5 p-3 rounded-xl">
                <Hash className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">إجمالي الحسابات</h3>
              <div className="text-2xl font-bold text-foreground font-sans">
                {summary?.totalAccounts || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">عدد الحسابات المسجلة بالشجرة</p>
            </div>
          </Card>
          
          <Card className="p-5 flex flex-col gap-4 group hover:border-primary/30 transition-colors relative overflow-hidden">
            <div className="flex justify-between items-start relative z-10">
              <div className="bg-primary/5 p-3 rounded-xl">
                <Tag className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">الأقسام الرئيسية</h3>
              <div className="text-2xl font-bold text-foreground font-sans">
                {summary?.accountsByType?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">أنواع الحسابات النشطة</p>
            </div>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold">توزيع الحسابات</h2>
                <p className="text-sm text-muted-foreground">نسبة أنواع الحسابات في الشجرة</p>
              </div>
            </div>
            <div className="h-[300px] w-full flex items-center justify-center">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', fontFamily: 'Cairo, sans-serif' }}
                      itemStyle={{ fontFamily: 'Cairo, sans-serif' }}
                      formatter={(value: number) => [value, "عدد الحسابات"]}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      wrapperStyle={{ fontFamily: 'Cairo, sans-serif', fontSize: '14px', fontWeight: 600 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-muted-foreground text-sm font-semibold flex flex-col items-center gap-2">
                  <PieChartIcon className="w-10 h-10 opacity-20" />
                  لا توجد حسابات بعد
                </div>
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-bold text-foreground mb-2">ملخص الأقسام</h3>
            {summary?.accountsByType?.map((item) => (
              <Card key={item.type} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[item.type as keyof typeof COLORS] || "gray" }} />
                  <span className="font-semibold text-sm">{typeLabels[item.type] || item.type}</span>
                </div>
                <span className="font-bold text-lg font-sans tabular-nums">{item.count}</span>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}