import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle,
  XCircle,
  Clock,
  Building2,
  ExternalLink,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface PaymentRequest {
  id: string;
  companyId: string;
  companyName: string | null;
  country: string | null;
  planId: string;
  planNameAr: string | null;
  planNameEn: string | null;
  amount: string;
  currency: string;
  billingCycle: string;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  proofUrl: string | null;
  reviewedBySuperAdminId: string | null;
  reviewerEmail: string | null;
  reviewerName: string | null;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface ReviewDialog {
  requestId: string;
  companyId: string;
  action: "approve" | "reject";
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const billingCycleKey: Record<string, string> = {
  monthly: "paymentRequestsMonthly",
  quarterly: "paymentRequestsQuarterly",
  yearly: "paymentRequestsYearly",
};

function usePaymentRequests(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return useQuery<PaymentRequest[]>({
    queryKey: ["super-admin-payment-requests", qs],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/payment-requests${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch payment requests");
      return res.json();
    },
  });
}

export function SuperAdminPaymentRequests() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [filters, setFilters] = useState({
    status: "",
    country: "",
    currency: "",
    companyId: "",
    dateFrom: "",
    dateTo: "",
  });

  const [dialog, setDialog] = useState<ReviewDialog | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data = [], isLoading } = usePaymentRequests(filters);

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, companyId, action, notes }: ReviewDialog & { notes: string }) => {
      const res = await fetch(
        `/api/super-admin/companies/${companyId}/payment-requests/${requestId}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: notes || undefined }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-payment-requests"] });
      toast({
        title:
          variables.action === "approve"
            ? t("superAdmin.paymentRequestsApproveSuccess")
            : t("superAdmin.paymentRequestsRejectSuccess"),
      });
      setDialog(null);
      setReviewNotes("");
    },
    onError: (_err, variables) => {
      toast({
        title:
          variables.action === "approve"
            ? t("superAdmin.paymentRequestsApproveError")
            : t("superAdmin.paymentRequestsRejectError"),
        variant: "destructive",
      });
    },
  });

  function openDialog(req: PaymentRequest, action: "approve" | "reject") {
    setReviewNotes("");
    setDialog({ requestId: req.id, companyId: req.companyId, action });
  }

  function handleConfirm() {
    if (!dialog) return;
    reviewMutation.mutate({ ...dialog, notes: reviewNotes });
  }

  function getPlanName(req: PaymentRequest) {
    if (isRtl && req.planNameAr) return req.planNameAr;
    return req.planNameEn ?? req.planId;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("superAdmin.paymentRequestsTitle")}
        </h1>
        <p className="text-muted-foreground">{t("superAdmin.paymentRequestsSubtitle")}</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Status filter */}
            <Select
              value={filters.status || "__all__"}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "__all__" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("superAdmin.paymentRequestsFilterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("superAdmin.paymentRequestsAll")}</SelectItem>
                <SelectItem value="pending">{t("superAdmin.paymentRequestsPending")}</SelectItem>
                <SelectItem value="approved">{t("superAdmin.paymentRequestsApproved")}</SelectItem>
                <SelectItem value="rejected">{t("superAdmin.paymentRequestsRejected")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Country filter */}
            <Input
              placeholder={t("superAdmin.paymentRequestsFilterCountry")}
              value={filters.country}
              onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
            />

            {/* Currency filter */}
            <Input
              placeholder={t("superAdmin.paymentRequestsFilterCurrency")}
              value={filters.currency}
              onChange={(e) => setFilters((f) => ({ ...f, currency: e.target.value }))}
            />

            {/* Date from */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                {t("superAdmin.paymentRequestsFilterDateFrom")}
              </Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>

            {/* Date to */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                {t("superAdmin.paymentRequestsFilterDateTo")}
              </Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>

            {/* Reset */}
            <Button
              variant="outline"
              onClick={() =>
                setFilters({ status: "", country: "", currency: "", companyId: "", dateFrom: "", dateTo: "" })
              }
            >
              {t("common.all")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {t("superAdmin.paymentRequestsNoResults")}
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((req) => (
            <Card key={req.id}>
              <CardContent className="p-5 space-y-4">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-base">
                      <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{req.companyName ?? req.companyId}</span>
                      {req.country && (
                        <Badge variant="outline" className="text-xs font-normal">
                          {req.country}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {getPlanName(req)} · {t(`superAdmin.${billingCycleKey[req.billingCycle] ?? "paymentRequestsBillingCycle"}`)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">
                      {req.amount} {req.currency}
                    </span>
                    <Badge className={statusColors[req.status] ?? "bg-gray-100 text-gray-800"}>
                      {req.status === "pending" && <Clock className="w-3 h-3 me-1" />}
                      {req.status === "approved" && <CheckCircle className="w-3 h-3 me-1" />}
                      {req.status === "rejected" && <XCircle className="w-3 h-3 me-1" />}
                      {t(`superAdmin.paymentRequests${req.status.charAt(0).toUpperCase()}${req.status.slice(1)}`)}
                    </Badge>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground block">{t("superAdmin.paymentRequestsRequestedAt")}</span>
                    <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                  </div>

                  {req.notes && (
                    <div>
                      <span className="text-muted-foreground block">{t("superAdmin.paymentRequestsNotes")}</span>
                      <span>{req.notes}</span>
                    </div>
                  )}

                  {req.reviewerName && (
                    <div>
                      <span className="text-muted-foreground block">{t("superAdmin.paymentRequestsReviewedBy")}</span>
                      <span>{req.reviewerName}</span>
                    </div>
                  )}

                  {req.reviewedAt && (
                    <div>
                      <span className="text-muted-foreground block">{t("superAdmin.paymentRequestsReviewedAt")}</span>
                      <span>{new Date(req.reviewedAt).toLocaleDateString()}</span>
                    </div>
                  )}

                  {req.reviewerNotes && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground block">{t("superAdmin.paymentRequestsReviewerNotes")}</span>
                      <span>{req.reviewerNotes}</span>
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {req.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => openDialog(req, "approve")}
                      >
                        <CheckCircle className="w-4 h-4 me-1" />
                        {t("superAdmin.paymentRequestsApproveAction")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => openDialog(req, "reject")}
                      >
                        <XCircle className="w-4 h-4 me-1" />
                        {t("superAdmin.paymentRequestsRejectAction")}
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/super-admin/companies?id=${req.companyId}`)}
                  >
                    <Building2 className="w-4 h-4 me-1" />
                    {t("superAdmin.paymentRequestsViewCompany")}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/super-admin/subscriptions?companyId=${req.companyId}`)}
                  >
                    <FileText className="w-4 h-4 me-1" />
                    {t("superAdmin.paymentRequestsViewSubscription")}
                  </Button>

                  {req.proofUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={req.proofUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 me-1" />
                        {t("superAdmin.paymentRequestsViewProof")}
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === "approve"
                ? t("superAdmin.paymentRequestsApproveTitle")
                : t("superAdmin.paymentRequestsRejectTitle")}
            </DialogTitle>
            <DialogDescription>
              {dialog?.action === "approve"
                ? t("superAdmin.paymentRequestsApproveDesc")
                : t("superAdmin.paymentRequestsRejectDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{t("superAdmin.paymentRequestsReviewerNotesLabel")}</Label>
            <Textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={reviewMutation.isPending}
              variant={dialog?.action === "reject" ? "destructive" : "default"}
              className={dialog?.action === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : undefined}
            >
              {dialog?.action === "approve"
                ? t("superAdmin.paymentRequestsConfirmApprove")
                : t("superAdmin.paymentRequestsConfirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
