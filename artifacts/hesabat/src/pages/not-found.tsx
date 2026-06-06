import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 font-sans">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 flex flex-col gap-4">
          <div className="flex gap-3 items-center">
            <AlertCircle className="h-8 w-8 text-destructive shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">{t("notFound.title")}</h1>
          </div>

          <p className="text-sm text-muted-foreground">
            {t("notFound.body")}
          </p>

          <Button asChild className="h-11 font-bold mt-2">
            <Link href="/dashboard">{t("notFound.backHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
