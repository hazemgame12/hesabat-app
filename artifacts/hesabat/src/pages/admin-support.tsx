import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Filter,
  ArrowLeft,
  MessageSquare,
  Send,
  Ticket,
  BarChart3,
  AlertCircle,
  Lightbulb,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  Building2,
  ThumbsUp,
} from "lucide-react";

/* ─── Types ─── */
interface AdminTicket {
  id: string;
  companyId: string;
  userId: string;
  type: "issue" | "feature_request";
  subject: string;
  body: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  userEmail?: string;
  companyName?: string;
  votes?: number;
}

interface TicketComment {
  id: number;
  ticketId: string;
  userId: string;
  body: string;
  isInternal: boolean;
  isAdminReply: boolean;
  isReadByAdmin: boolean;
  createdAt: string;
  userName?: string;
}

interface TicketDetail {
  ticket: AdminTicket;
  comments: TicketComment[];
  votes: number;
}

interface Stats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  byType: { type: string; count: number }[];
  byPriority: { priority: string; count: number }[];
}

/* ─── API helpers ─── */
const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
};

/* ─── Badge configs ─── */
const statusMap = {
  open: { label: "statusOpen", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "statusInProgress", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "statusResolved", color: "bg-green-100 text-green-700" },
  closed: { label: "statusClosed", color: "bg-slate-100 text-slate-700" },
} as const;

const priorityMap = {
  low: { label: "priorityLow", color: "bg-slate-100 text-slate-700" },
  medium: { label: "priorityMedium", color: "bg-amber-100 text-amber-700" },
  high: { label: "priorityHigh", color: "bg-orange-100 text-orange-700" },
  critical: { label: "priorityCritical", color: "bg-red-100 text-red-700" },
} as const;

/* ─── Stats Card ─── */
function StatsCards({ stats, t }: { stats: Stats; t: (k: string) => string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <Card className="p-4 shadow-sm border-border">
        <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        <div className="text-xs text-muted-foreground">{t("support.admin.allTickets")}</div>
      </Card>
      <Card className="p-4 shadow-sm border-border">
        <div className="text-2xl font-bold text-blue-600">{stats.open}</div>
        <div className="text-xs text-muted-foreground">{t("support.statusOpen")}</div>
      </Card>
      <Card className="p-4 shadow-sm border-border">
        <div className="text-2xl font-bold text-amber-600">{stats.inProgress}</div>
        <div className="text-xs text-muted-foreground">{t("support.statusInProgress")}</div>
      </Card>
      <Card className="p-4 shadow-sm border-border">
        <div className="text-2xl font-bold text-green-600">{stats.resolved + stats.closed}</div>
        <div className="text-xs text-muted-foreground">{t("support.statusResolved")}</div>
      </Card>
    </div>
  );
}

/* ─── Admin Ticket Detail ─── */
function AdminTicketDetail({
  ticketId,
  onBack,
}: {
  ticketId: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lang = i18n.language;

  const { data, isLoading } = useQuery<TicketDetail>({
    queryKey: ["admin", "support", "ticket", ticketId],
    queryFn: () => apiFetch(`/admin/support/tickets/${ticketId}`),
  });

  // mark-read on open
  React.useEffect(() => {
    apiFetch(`/admin/support/tickets/${ticketId}/mark-read`, { method: "POST" }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "unread-count"] });
    }).catch(() => {});
  }, [ticketId, queryClient]);

  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState("");

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      apiFetch(`/admin/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      toast({ title: t("support.admin.update") });
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "stats"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: err?.message || t("support.error") });
    },
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/support/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment, isInternal }),
      }),
    onSuccess: () => {
      setComment("");
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "ticket", ticketId] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: err?.message || t("support.error") });
    },
  });

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t("support.error")}
      </div>
    );
  }

  const { ticket, comments, votes } = data;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("support.back")}
      </button>

      <Card className="p-6 shadow-sm border-border mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge
                variant="secondary"
                className={
                  ticket.type === "issue"
                    ? "bg-red-50 text-red-700"
                    : "bg-purple-50 text-purple-700"
                }
              >
                {ticket.type === "issue" ? (
                  <AlertCircle className="w-3 h-3 me-1" />
                ) : (
                  <Lightbulb className="w-3 h-3 me-1" />
                )}
                {t(ticket.type === "issue" ? "support.typeIssue" : "support.typeFeature")}
              </Badge>
              <Badge variant="secondary" className={statusMap[ticket.status].color}>
                {t(`support.${statusMap[ticket.status].label}`)}
              </Badge>
              <Badge variant="secondary" className={priorityMap[ticket.priority].color}>
                {t(`support.${priorityMap[ticket.priority].label}`)}
              </Badge>
              {ticket.type === "feature_request" && (
                <Badge variant="secondary" className="bg-purple-50 text-purple-700">
                  <ThumbsUp className="w-3 h-3 me-1" />
                  {votes} {t("support.votes")}
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground">{ticket.subject}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("support.ticketNumber")} {ticket.id.slice(0, 8)}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {ticket.userName || ticket.userEmail || "—"}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {ticket.companyName || "—"}
              </span>
              <span>{fmtDate(ticket.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap border-t pt-4">
          {ticket.body}
        </div>
      </Card>

      {/* Update controls */}
      <Card className="p-4 shadow-sm border-border mb-6">
        <h3 className="text-sm font-bold text-foreground mb-3">
          {t("support.admin.update")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("support.status")}</label>
            <Select value={status} onValueChange={(v) => { setStatus(v); updateMutation.mutate({ status: v }); }}>
              <SelectTrigger>
                <SelectValue placeholder={t("support.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("support.statusOpen")}</SelectItem>
                <SelectItem value="in_progress">{t("support.statusInProgress")}</SelectItem>
                <SelectItem value="resolved">{t("support.statusResolved")}</SelectItem>
                <SelectItem value="closed">{t("support.statusClosed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("support.priority")}</label>
            <Select value={priority} onValueChange={(v) => { setPriority(v); updateMutation.mutate({ priority: v }); }}>
              <SelectTrigger>
                <SelectValue placeholder={t("support.priority")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("support.priorityLow")}</SelectItem>
                <SelectItem value="medium">{t("support.priorityMedium")}</SelectItem>
                <SelectItem value="high">{t("support.priorityHigh")}</SelectItem>
                <SelectItem value="critical">{t("support.priorityCritical")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("support.admin.assign")}</label>
            <Input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder={t("support.admin.assign")}
              onBlur={() => {
                if (assignedTo.trim()) {
                  updateMutation.mutate({ assignedTo: assignedTo.trim() });
                }
              }}
            />
          </div>
        </div>
      </Card>

      {/* Thread */}
      <div className="mb-4">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {t("support.comments")} ({comments.length})
        </h3>

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("support.noComments")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {comments.map((c) => {
              const isAdmin = c.isAdminReply ?? false;
              if (c.isInternal) {
                return (
                  <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    <div className="flex items-center gap-2 mb-1 text-xs text-amber-600">
                      <span className="font-bold">{t("support.admin.internalComment")}</span>
                      <span>{fmtDate(c.createdAt)}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                );
              }
              return (
                <div key={c.id} className={`flex gap-3 ${isAdmin ? "flex-row" : "flex-row-reverse"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isAdmin ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {isAdmin ? "د" : ((c.userName || c.userId).slice(0, 1).toUpperCase())}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isAdmin ? "bg-primary/10 text-foreground rounded-tl-sm" : "bg-muted text-foreground rounded-tr-sm"}`}>
                    {!isAdmin && <p className="text-xs font-bold text-muted-foreground mb-1">{c.userName || "—"}</p>}
                    <p className="leading-relaxed">{c.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">{fmtDate(c.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add comment */}
      <div className="flex flex-col gap-3">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("support.commentPlaceholder")}
          rows={3}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded border-border"
            />
            {t("support.admin.internalComment")}
          </label>
          <Button
            onClick={() => commentMutation.mutate()}
            disabled={commentMutation.isPending || !comment.trim()}
            className="h-10 text-sm font-bold shadow-md hover:opacity-90"
          >
            {commentMutation.isPending ? (
              <Spinner className="w-4 h-4 me-2" />
            ) : (
              <Send className="w-4 h-4 me-2" />
            )}
            {t("support.addComment")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Admin Page ─── */
export function AdminSupport() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<"list" | "detail">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [sortByVotes, setSortByVotes] = useState<boolean>(false);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["admin", "support", "stats"],
    queryFn: () => apiFetch("/admin/support/tickets/stats"),
  });

  const { data: ticketsData, isLoading } = useQuery<{ tickets: AdminTicket[] }>({
    queryKey: ["admin", "support", "tickets", { status: filterStatus, type: filterType, priority: filterPriority }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("type", filterType);
      if (filterPriority !== "all") params.set("priority", filterPriority);
      return apiFetch(`/admin/support/tickets?${params.toString()}`);
    },
  });

  const tickets = ticketsData?.tickets ?? [];
  const lang = i18n.language;

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  const handleExport = () => {
    const rows = [
      ["Type", "Subject", "Status", "Priority", "Votes", "Company", "User", "Created"],
      ...tickets.map((tk) => [
        tk.type,
        tk.subject,
        tk.status,
        tk.priority,
        String(tk.votes ?? 0),
        tk.companyName || "",
        tk.userName || tk.userEmail || "",
        tk.createdAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayTickets = sortByVotes
    ? [...tickets].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
    : tickets;

  if (view === "detail" && detailId) {
    return <AdminTicketDetail ticketId={detailId} onBack={() => setView("list")} />;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("support.admin.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("support.admin.allTickets")}</p>
        </div>
      </div>

      {/* Stats */}
      {stats && <StatsCards stats={stats} t={t as any} />}

      {/* Filters + Actions */}
      <div className="flex flex-wrap items-end gap-3 mt-2 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> {t("support.type")}
          </label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("support.type")}</SelectItem>
              <SelectItem value="issue">{t("support.typeIssue")}</SelectItem>
              <SelectItem value="feature_request">{t("support.typeFeature")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> {t("support.status")}
          </label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("support.status")}</SelectItem>
              <SelectItem value="open">{t("support.statusOpen")}</SelectItem>
              <SelectItem value="in_progress">{t("support.statusInProgress")}</SelectItem>
              <SelectItem value="resolved">{t("support.statusResolved")}</SelectItem>
              <SelectItem value="closed">{t("support.statusClosed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> {t("support.priority")}
          </label>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("support.priority")}</SelectItem>
              <SelectItem value="low">{t("support.priorityLow")}</SelectItem>
              <SelectItem value="medium">{t("support.priorityMedium")}</SelectItem>
              <SelectItem value="high">{t("support.priorityHigh")}</SelectItem>
              <SelectItem value="critical">{t("support.priorityCritical")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("support.sortByVotes")}</label>
          <Button
            variant={sortByVotes ? "default" : "outline"}
            size="sm"
            onClick={() => setSortByVotes((v) => !v)}
            className="h-9"
          >
            <ThumbsUp className="w-4 h-4 me-1" />
            {sortByVotes ? t("common.all") : t("support.sortByVotes")}
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("support.export")}</label>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-9">
            {t("support.export")}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : displayTickets.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("support.noTickets")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">{t("support.type")}</TableHead>
                <TableHead>{t("support.subject")}</TableHead>
                <TableHead>{t("support.status")}</TableHead>
                <TableHead>{t("support.priority")}</TableHead>
                <TableHead>{t("support.votes")}</TableHead>
                <TableHead>{t("support.admin.assign")}</TableHead>
                <TableHead>{t("support.company")}</TableHead>
                <TableHead>{t("support.user")}</TableHead>
                <TableHead>{t("support.createdAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayTickets.map((tk) => (
                <TableRow
                  key={tk.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setDetailId(tk.id);
                    setView("detail");
                  }}
                >
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        tk.type === "issue"
                          ? "bg-red-50 text-red-700"
                          : "bg-purple-50 text-purple-700"
                      }
                    >
                      {tk.type === "issue" ? (
                        <AlertCircle className="w-3 h-3 me-1" />
                      ) : (
                        <Lightbulb className="w-3 h-3 me-1" />
                      )}
                      {t(tk.type === "issue" ? "support.typeIssue" : "support.typeFeature")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-foreground max-w-xs truncate">
                    {tk.subject}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusMap[tk.status].color}>
                      {t(`support.${statusMap[tk.status].label}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={priorityMap[tk.priority].color}>
                      {t(`support.${priorityMap[tk.priority].label}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tk.votes ?? 0}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tk.assignedTo ? tk.assignedTo.slice(0, 8) + "..." : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tk.companyName || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tk.userName || tk.userEmail || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {fmtDate(tk.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
