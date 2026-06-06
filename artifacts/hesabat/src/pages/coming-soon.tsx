import React from "react";
import { Link } from "wouter";
import { ArrowRight, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 h-full p-8 text-center" dir="rtl">
      <div className="w-24 h-24 bg-secondary/30 rounded-full flex items-center justify-center mb-6">
        <Wrench className="w-12 h-12 text-secondary-foreground opacity-80" />
      </div>
      <h1 className="text-3xl font-bold text-foreground mb-3 font-sans">قريباً جداً</h1>
      <p className="text-muted-foreground max-w-md text-lg leading-relaxed mb-8">
        نعمل بجد لإضافة هذه الميزة قريباً لتجعل إدارة حساباتك أسهل وأكثر شمولية.
      </p>
      <Button asChild className="h-11 px-6 shadow-sm">
        <Link href="/dashboard" className="flex items-center gap-2">
          العودة للرئيسية
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  );
}