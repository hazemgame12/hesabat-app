import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HelpCircle,
  Lightbulb,
  ArrowRight,
  Send,
  Building2,
  User,
  MessageSquare,
  Lock,
} from "lucide-react";

/* ─── Types ─── */
interface TicketSummary {
  id: string;
  type: "issue" | "feature_request";
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
  userName?: string | null;
  companyName?: string | null;
}

interface TicketDetail extends TicketSummary {
  body: string;
  userId?: string | null;
  userEmail?: string | null;
}

interface Comment {
  id: number;
  ticketId: string;
  userId?: string | null;
  authorName?: string | null;
  body: string;
  isInternal: boolean;
  isAdminReply: boolean;
  createdAt: string;
  userName?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_AR: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "جارية",
  resolved: "محلولة",
  closed: "مغلقة",
};

const PRIORITY_AR: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "عالي",
  critical: "حرج",
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

/* ─── Detail Panel ─── */
function TicketDetailPanel({
  ticketId,
  onBack,
}: {
  ticketId: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery<{ ticket: TicketDetail; comments: Comment[] }>({
    queryKey: ["super-admin", "ticket", ticketId],
    queryFn: () => apiFetch(`/super-admin/support-tickets/${ticketId}`),
  });

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [data?.comments?.length]);

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/super-admin/support-tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["super-admin", "tickets"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const replyMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/super-admin/support-tickets/${ticketId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim(), isInternal }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["super-admin", "tickets"] });
      setReply("");
      setIsInternal(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-16 text-destructive">
        <p>حدث خطأ في تحميل التذكرة</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          {t("superAdmin.backToTickets")}
        </Button>
      </div>
    );
  }

  const { ticket, comments } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg truncate">{ticket.subject}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="w-3.5 h-3.5" />
            <span>{ticket.companyName || "—"}</span>
            <span>·</span>
            <User className="w-3.5 h-3.5" />
            <span>{ticket.userName || "—"}</span>
            <span>·</span>
            <span>{fmtDate(ticket.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={PRIORITY_COLORS[ticket.priority]}>
            {PRIORITY_AR[ticket.priority] || ticket.priority}
          </Badge>
        </div>
      </div>

      {/* Status + change */}
      <div className="flex items-center gap-3">
        <Badge className={STATUS_COLORS[ticket.status]}>
          {STATUS_AR[ticket.status] || ticket.status}
        </Badge>
        <Select
          value={ticket.status}
          onValueChange={(v) => statusMutation.mutate(v)}
          disabled={statusMutation.isPending}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder={t("superAdmin.changeStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">مفتوحة</SelectItem>
            <SelectItem value="in_progress">جارية</SelectItem>
            <SelectItem value="resolved">محلولة</SelectItem>
            <SelectItem value="closed">مغلقة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Original body */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {ticket.type === "issue" ? (
              <HelpCircle className="w-3.5 h-3.5" />
            ) : (
              <Lightbulb className="w-3.5 h-3.5" />
            )}
            <span className="font-semibold">
              {ticket.type === "issue" ? "مشكلة / سؤال" : "طلب ميزة"}
            </span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.body}</p>
        </CardContent>
      </Card>

      {/* Thread */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {t("superAdmin.conversation")}
        </h3>
        <div
          ref={threadRef}
          className="flex flex-col gap-3 max-h-80 overflow-y-auto pe-1"
        >
          {comments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              {t("superAdmin.noComments")}
            </p>
          ) : (
            comments.map((c) => {
              if (c.isInternal) {
                return (
                  <div
                    key={c.id}
                    className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800"
                  >
                    <div className="flex items-center gap-2 mb-1 text-xs text-amber-600">
                      <Lock className="w-3 h-3" />
                      <span className="font-bold">{t("superAdmin.internalNote")}</span>
                      <span>·</span>
                      <span>{c.authorName || c.userName || "—"}</span>
                      <span>·</span>
                      <span>{fmtDate(c.createdAt)}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                );
              }
              const isAdmin = c.isAdminReply;
              const displayName = isAdmin
                ? (c.authorName || t("superAdmin.adminReply"))
                : (c.userName || "المستخدم");
              return (
                <div
                  key={c.id}
                  className={`flex gap-3 ${isAdmin ? "flex-row" : "flex-row-reverse"}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isAdmin
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      isAdmin
                        ? "bg-primary/10 text-foreground rounded-tl-sm"
                        : "bg-muted text-foreground rounded-tr-sm"
                    }`}
                  >
                    <p className="text-xs font-bold text-muted-foreground mb-1">{displayName}</p>
                    <p className="leading-relaxed">{c.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">{fmtDate(c.createdAt)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Reply box */}
      {ticket.status !== "closed" && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("superAdmin.replyPlaceholder")}
            rows={3}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded border-border"
              />
              {t("superAdmin.internalNote")}
            </label>
            <Button
              onClick={() => replyMutation.mutate()}
              disabled={replyMutation.isPending || !reply.trim()}
              className="h-9 text-sm font-bold"
            >
              {replyMutation.isPending ? (
                <Spinner className="w-4 h-4 me-2" />
              ) : (
                <Send className="w-4 h-4 me-2" />
              )}
              {t("superAdmin.sendReply")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export function SuperAdminSupportTickets() {
  const { t, i18n } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: tickets = [], isLoading } = useQuery<TicketSummary[]>({
    queryKey: ["super-admin", "tickets"],
    queryFn: () => apiFetch("/super-admin/support-tickets"),
  });

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(iso));

  const filtered =
    filterStatus === "all" ? tickets : tickets.filter((t) => t.status === filterStatus);

  if (selectedId) {
    return (
      <div className="space-y-6">
        <TicketDetailPanel ticketId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.ticketsTitle")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.ticketsSubtitle")}</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="open">مفتوحة</SelectItem>
            <SelectItem value="in_progress">جارية</SelectItem>
            <SelectItem value="resolved">محلولة</SelectItem>
            <SelectItem value="closed">مغلقة</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} تذكرة</span>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-6 h-6" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا توجد تذاكر</div>
        ) : (
          filtered.map((ticket) => (
            <Card
              key={ticket.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedId(ticket.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                      {ticket.type === "issue" ? (
                        <HelpCircle className="w-4 h-4" />
                      ) : (
                        <Lightbulb className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{ticket.subject}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{ticket.companyName || "—"}</span>
                        <span>·</span>
                        <User className="w-3 h-3 shrink-0" />
                        <span className="truncate">{ticket.userName || "—"}</span>
                        <span>·</span>
                        <span className="shrink-0">{fmtDate(ticket.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge className={STATUS_COLORS[ticket.status]}>
                      {STATUS_AR[ticket.status] || ticket.status}
                    </Badge>
                    <Badge className={PRIORITY_COLORS[ticket.priority]} variant="outline">
                      {PRIORITY_AR[ticket.priority] || ticket.priority}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
