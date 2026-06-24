import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  LifeBuoy,
  Plus,
  ArrowLeft,
  MessageSquare,
  ThumbsUp,
  Send,
  Ticket,
  Filter,
  Lightbulb,
  AlertCircle,
} from "lucide-react";

/* ─── Types ─── */
interface SupportTicket {
  id: string;
  type: "issue" | "feature_request";
  subject: string;
  body: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TicketComment {
  id: number;
  ticketId: string;
  userId: string;
  body: string;
  isInternal: boolean;
  isAdminReply: boolean;
  isReadByUser: boolean;
  createdAt: string;
}

interface TicketDetail {
  ticket: SupportTicket;
  comments: TicketComment[];
  votes: number;
  userVoted: boolean;
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

/* ─── Status / Priority / Type badge configs ─── */
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

/* ─── Ticket List ─── */
function TicketList({
  tickets,
  onSelect,
  t,
  lang,
}: {
  tickets: SupportTicket[];
  onSelect: (id: string) => void;
  t: (k: string) => string;
  lang: string;
}) {
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );

  return (
    <div className="mt-4 rounded-xl border border-border overflow-hidden">
      {tickets.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {t("support.noTickets")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">{t("support.type")}</TableHead>
              <TableHead>{t("support.subject")}</TableHead>
              <TableHead>{t("support.status")}</TableHead>
              <TableHead>{t("support.priority")}</TableHead>
              <TableHead>{t("support.createdAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((tk) => (
              <TableRow
                key={tk.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelect(tk.id)}
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
                <TableCell className="font-medium text-foreground">{tk.subject}</TableCell>
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
                <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                  {fmtDate(tk.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/* ─── Create Ticket Form ─── */
function CreateTicket({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<"issue" | "feature_request">("issue");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subject, body, priority }),
      }),
    onSuccess: () => {
      toast({ title: t("support.created") });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      onCreated();
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: err?.message || t("support.error") });
    },
  });

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("support.back")}
      </button>
      <h2 className="text-xl font-bold text-foreground mb-1">{t("support.newTicket")}</h2>
      <p className="text-sm text-muted-foreground mb-6">{t("support.subtitle")}</p>

      <Card className="p-6 shadow-sm border-border">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("support.type")}</label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as "issue" | "feature_request")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="issue">{t("support.typeIssue")}</SelectItem>
                  <SelectItem value="feature_request">{t("support.typeFeature")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("support.priority")}</label>
              <Select
                value={priority}
                onValueChange={(v) =>
                  setPriority(v as "low" | "medium" | "high" | "critical")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("support.priorityLow")}</SelectItem>
                  <SelectItem value="medium">{t("support.priorityMedium")}</SelectItem>
                  <SelectItem value="high">{t("support.priorityHigh")}</SelectItem>
                  <SelectItem value="critical">{t("support.priorityCritical")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("support.subject")}</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("support.subjectPlaceholder")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("support.body")}</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("support.bodyPlaceholder")}
              rows={6}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !subject.trim() || !body.trim()}
              className="h-10 text-sm font-bold shadow-md hover:opacity-90"
            >
              {createMutation.isPending ? (
                <>
                  <Spinner className="w-4 h-4 me-2" />
                  {t("support.submitting")}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 me-2" />
                  {t("support.submit")}
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ─── Ticket Detail ─── */
function TicketDetailView({
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
    queryKey: ["support", "ticket", ticketId],
    queryFn: () => apiFetch(`/support/tickets/${ticketId}`),
  });

  const [comment, setComment] = useState("");

  // mark-read on open
  React.useEffect(() => {
    apiFetch(`/support/tickets/${ticketId}/mark-read`, { method: "POST" }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["support", "unread-count"] });
    }).catch(() => {});
  }, [ticketId, queryClient]);

  const commentMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/support/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment }),
      }),
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: err?.message || t("support.error") });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/support/tickets/${ticketId}/reopen`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: t("support.reopened") });
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: err?.message || t("support.error") });
    },
  });

  const voteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/support/tickets/${ticketId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support", "ticket", ticketId] });
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

  const { ticket, comments, votes, userVoted } = data;
  const isClosed = ticket.status === "resolved" || ticket.status === "closed";

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
            </div>
            <h2 className="text-xl font-bold text-foreground">{ticket.subject}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("support.ticketNumber")} {ticket.id.slice(0, 8)} · {fmtDate(ticket.createdAt)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {ticket.type === "feature_request" && (
              <Button
                variant={userVoted ? "default" : "outline"}
                size="sm"
                onClick={() => voteMutation.mutate()}
                disabled={voteMutation.isPending}
              >
                <ThumbsUp className="w-4 h-4 me-1" />
                {userVoted ? t("support.voted") : t("support.vote")}
                <span className="ms-1 font-bold">{votes}</span>
              </Button>
            )}
            {isClosed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
                className="text-amber-600 border-amber-300 hover:bg-amber-50"
              >
                {reopenMutation.isPending ? (
                  <Spinner className="w-3.5 h-3.5 me-1" />
                ) : (
                  <LifeBuoy className="w-3.5 h-3.5 me-1" />
                )}
                {t("support.reopen")}
              </Button>
            )}
          </div>
        </div>

        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap border-t pt-4">
          {ticket.body}
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
              const isAdmin = (c as any).isAdminReply;
              return (
                <div
                  key={c.id}
                  className={`flex gap-3 ${isAdmin ? "flex-row" : "flex-row-reverse"}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isAdmin ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {isAdmin ? "د" : "أ"}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isAdmin ? "bg-primary/10 text-foreground rounded-tl-sm" : "bg-muted text-foreground rounded-tr-sm"}`}>
                    <p className="leading-relaxed">{c.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">{fmtDate(c.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply box — disabled when closed */}
      {!isClosed ? (
        <div className="flex flex-col gap-3">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("support.commentPlaceholder")}
            rows={3}
          />
          <div className="flex justify-end">
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
      ) : (
        <div className="text-center text-sm text-muted-foreground py-4 bg-muted/30 rounded-xl">
          {t("support.closedNote")}
        </div>
      )}
    </div>
  );
}

/* ─── Feature Requests Tab ─── */
function FeatureRequestsTab({
  requests,
  isLoading,
  onBack,
  t,
  lang,
}: {
  requests: Array<SupportTicket & { votes: number; userVoted: boolean }>;
  isLoading: boolean;
  onBack: () => void;
  t: any;
  lang: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const voteMutation = useMutation({
    mutationFn: (ticketId: string) =>
      apiFetch(`/support/tickets/${ticketId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support", "feature-requests"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: err?.message || t("support.error") });
    },
  });

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(iso));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("support.back")}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Lightbulb className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("support.featureRequestsTab")}</h1>
          <p className="text-sm text-muted-foreground">{requests.length} {t("support.featureRequests")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : requests.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {t("support.noTickets")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((req) => (
            <Card key={req.id} className="p-5 shadow-sm border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="bg-purple-50 text-purple-700">
                      <Lightbulb className="w-3 h-3 me-1" />
                      {t("support.typeFeature")}
                    </Badge>
                    <Badge variant="secondary" className={statusMap[req.status].color}>
                      {t(`support.${statusMap[req.status].label}`)}
                    </Badge>
                    <Badge variant="secondary" className={priorityMap[req.priority].color}>
                      {t(`support.${priorityMap[req.priority].label}`)}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-foreground text-lg">{req.subject}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{req.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">{fmtDate(req.createdAt)}</p>
                </div>
                <Button
                  variant={req.userVoted ? "default" : "outline"}
                  size="sm"
                  onClick={() => voteMutation.mutate(req.id)}
                  disabled={voteMutation.isPending}
                  className="shrink-0"
                >
                  <ThumbsUp className="w-4 h-4 me-1" />
                  {req.userVoted ? t("support.voted") : t("support.vote")}
                  <span className="ms-1 font-bold">{req.votes}</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export function Support() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<"list" | "create" | "detail" | "features">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: ticketsData, isLoading } = useQuery<{ tickets: SupportTicket[] }>({
    queryKey: ["support", "tickets"],
    queryFn: () => apiFetch("/support/tickets"),
  });

  const { data: featureData, isLoading: featureLoading } = useQuery<{
    tickets: Array<SupportTicket & { votes: number; userVoted: boolean }>;
  }>({
    queryKey: ["support", "feature-requests"],
    queryFn: () => apiFetch("/support/feature-requests"),
  });

  const tickets = ticketsData?.tickets ?? [];
  const featureRequests = featureData?.tickets ?? [];

  const filtered = tickets.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  const myFeatureRequests = tickets.filter((t) => t.type === "feature_request");

  if (view === "create") {
    return (
      <CreateTicket
        onBack={() => setView("list")}
        onCreated={() => setView("list")}
      />
    );
  }

  if (view === "detail" && detailId) {
    return <TicketDetailView ticketId={detailId} onBack={() => setView("list")} />;
  }

  if (view === "features") {
    return (
      <FeatureRequestsTab
        requests={featureRequests}
        isLoading={featureLoading}
        onBack={() => setView("list")}
        t={t as any}
        lang={i18n.language}
      />
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("support.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("support.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setView("features")}
            className="h-10 text-sm font-bold"
          >
            <Lightbulb className="w-4 h-4 me-2" />
            {t("support.featureRequestsTab")}
          </Button>
          <Button
            onClick={() => setView("create")}
            className="h-10 text-sm font-bold shadow-md hover:opacity-90"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("support.newTicket")}
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <Card className="p-4 shadow-sm border-border">
          <div className="text-2xl font-bold text-foreground">{tickets.length}</div>
          <div className="text-xs text-muted-foreground">{t("support.myTickets")}</div>
        </Card>
        <Card className="p-4 shadow-sm border-border">
          <div className="text-2xl font-bold text-foreground">
            {tickets.filter((t) => t.status === "open").length}
          </div>
          <div className="text-xs text-muted-foreground">{t("support.statusOpen")}</div>
        </Card>
        <Card className="p-4 shadow-sm border-border">
          <div className="text-2xl font-bold text-foreground">
            {tickets.filter((t) => t.status === "resolved" || t.status === "closed").length}
          </div>
          <div className="text-xs text-muted-foreground">{t("support.statusResolved")}</div>
        </Card>
        <Card className="p-4 shadow-sm border-border">
          <div className="text-2xl font-bold text-foreground">{myFeatureRequests.length}</div>
          <div className="text-xs text-muted-foreground">{t("support.featureRequests")}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mt-6">
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
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <TicketList
          tickets={filtered}
          onSelect={(id) => {
            setDetailId(id);
            setView("detail");
          }}
          t={t as any}
          lang={i18n.language}
        />
      )}
    </div>
  );
}
