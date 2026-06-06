import React, { useState } from "react";
import {
  useListTeamMembers,
  useUpdateMemberRole,
  useRemoveMember,
  useListInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  getListTeamMembersQueryKey,
  getListInvitationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ASSIGNABLE_ROLES,
  type RoleId,
} from "@workspace/permissions";
import { Users, UserPlus, Trash2, X, Check, Copy, Mail, Clock } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const inviteSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  role: z.enum(["manager", "accountant", "data_entry", "viewer"]),
});

function roleLabel(role: string): string {
  return ROLE_LABELS[role as RoleId] ?? role;
}

function buildInviteLink(token: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/invite/${token}`;
}

export function Team() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: members = [], isLoading: membersLoading } = useListTeamMembers();
  const { data: invitations = [], isLoading: invitesLoading } = useListInvitations();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const createInvitation = useCreateInvitation();
  const revokeInvitation = useRevokeInvitation();

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<{ id: string; email: string } | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "viewer" },
  });

  const invalidateMembers = () =>
    queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
  const invalidateInvites = () =>
    queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });

  const openInviteModal = () => {
    reset({ email: "", role: "viewer" });
    setCreatedLink(null);
    setInviteModalOpen(true);
  };

  const onInviteSubmit = (data: z.infer<typeof inviteSchema>) => {
    createInvitation.mutate({ data }, {
      onSuccess: (res) => {
        invalidateInvites();
        setCreatedLink(buildInviteLink(res.token));
        toast({ title: "تم إنشاء الدعوة بنجاح" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "خطأ", description: err?.data?.error || "تعذر إنشاء الدعوة" });
      },
    });
  };

  const handleRoleChange = (id: string, role: string) => {
    updateRole.mutate({ id, data: { role: role as any } }, {
      onSuccess: () => {
        invalidateMembers();
        toast({ title: "تم تحديث الدور بنجاح" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "خطأ", description: err?.data?.error || "تعذر تحديث الدور" });
      },
    });
  };

  const handleRemoveMember = () => {
    if (!memberToRemove) return;
    removeMember.mutate({ id: memberToRemove.id }, {
      onSuccess: () => {
        invalidateMembers();
        toast({ title: "تمت إزالة العضو" });
        setMemberToRemove(null);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "خطأ", description: err?.data?.error || "تعذر إزالة العضو" });
        setMemberToRemove(null);
      },
    });
  };

  const handleRevoke = () => {
    if (!inviteToRevoke) return;
    revokeInvitation.mutate({ id: inviteToRevoke.id }, {
      onSuccess: () => {
        invalidateInvites();
        toast({ title: "تم إلغاء الدعوة" });
        setInviteToRevoke(null);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "خطأ", description: err?.data?.error || "تعذر إلغاء الدعوة" });
        setInviteToRevoke(null);
      },
    });
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(
      () => toast({ title: "تم نسخ الرابط" }),
      () => toast({ variant: "destructive", title: "تعذر النسخ" }),
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">الفريق والصلاحيات</h1>
            <p className="text-sm text-muted-foreground font-medium">إدارة أعضاء الفريق وأدوارهم ودعوة موظفين جدد</p>
          </div>
        </div>

        <button
          onClick={openInviteModal}
          className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <UserPlus className="w-4 h-4" />
          دعوة عضو
        </button>
      </header>

      <div className="p-8 flex flex-col gap-8 max-w-5xl mx-auto w-full">
        {/* Members */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-extrabold text-foreground px-1">أعضاء الفريق</h2>
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            {membersLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold uppercase shrink-0">
                      {m.name?.[0] || "م"}
                    </div>
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">{m.name}</span>
                        {m.isSelf && (
                          <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">أنت</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate" dir="ltr">{m.email}</span>
                    </div>

                    {m.role === "owner" ? (
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full">
                        {roleLabel(m.role)}
                      </span>
                    ) : (
                      <select
                        value={m.role}
                        disabled={m.isSelf || updateRole.isPending}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        className="appearance-none bg-background border rounded-lg h-9 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    )}

                    {!m.isSelf && m.role !== "owner" && (
                      <button
                        onClick={() => setMemberToRemove({ id: m.id, name: m.name })}
                        className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors shrink-0"
                        title="إزالة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Pending invitations */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-extrabold text-foreground px-1">الدعوات المعلقة</h2>
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            {invitesLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : invitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 text-muted-foreground gap-2">
                <Mail className="w-8 h-8 opacity-40" />
                <p className="text-sm">لا توجد دعوات معلقة.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <span className="text-sm font-bold truncate" dir="ltr">{inv.email}</span>
                      <span className="text-xs text-muted-foreground">{roleLabel(inv.role)}</span>
                    </div>
                    <button
                      onClick={() => setInviteToRevoke({ id: inv.id, email: inv.email })}
                      className="text-xs font-bold text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      إلغاء الدعوة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Invite modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setInviteModalOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">دعوة عضو جديد</h2>
              </div>
              <button type="button" onClick={() => setInviteModalOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdLink ? (
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2 text-center">
                  <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-foreground">تم إنشاء الدعوة!</p>
                  <p className="text-xs text-muted-foreground">انسخ الرابط وأرسله للموظف ليُكمل التسجيل. الرابط صالح لمدة 7 أيام.</p>
                </div>
                <div className="flex items-center gap-2 bg-muted rounded-xl p-2">
                  <input
                    readOnly
                    value={createdLink}
                    dir="ltr"
                    className="flex-1 bg-transparent text-xs font-sans px-2 outline-none text-foreground/80 truncate"
                  />
                  <button
                    onClick={() => copyLink(createdLink)}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    نسخ
                  </button>
                </div>
                <button
                  onClick={() => setInviteModalOpen(false)}
                  className="w-full py-2.5 rounded-full text-sm font-bold bg-muted text-foreground hover:bg-muted/70 transition-colors mt-2"
                >
                  تم
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onInviteSubmit)} className="p-6 flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">البريد الإلكتروني</label>
                  <input
                    type="email"
                    dir="ltr"
                    placeholder="name@company.com"
                    className="bg-background border rounded-xl h-11 px-4 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    {...register("email")}
                  />
                  {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-foreground">الدور</label>
                  <div className="flex flex-col gap-2">
                    {ASSIGNABLE_ROLES.map((r) => (
                      <label key={r} className="flex items-start gap-3 border rounded-xl p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                        <input type="radio" value={r} className="mt-1 accent-primary" {...register("role")} />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground">{ROLE_LABELS[r]}</span>
                          <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createInvitation.isPending}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-3 rounded-full text-sm font-bold hover:opacity-90 transition-opacity mt-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {createInvitation.isPending ? "جاري الإنشاء..." : "إنشاء رابط الدعوة"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent dir="rtl" className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">إزالة العضو</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من إزالة "{memberToRemove?.name}" من الفريق؟ سيفقد الوصول إلى الشركة فورًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {removeMember.isPending ? "جاري الإزالة..." : "تأكيد الإزالة"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!inviteToRevoke} onOpenChange={(open) => !open && setInviteToRevoke(null)}>
        <AlertDialogContent dir="rtl" className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">إلغاء الدعوة</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من إلغاء دعوة "{inviteToRevoke?.email}"؟ لن يعمل رابط الدعوة بعد ذلك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {revokeInvitation.isPending ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
