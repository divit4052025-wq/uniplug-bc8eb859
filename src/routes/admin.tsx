import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  CalendarClock,
  TrendingUp,
  LogOut,
  Search,
  FileText,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getMentorVerificationDocs } from "@/lib/admin/mentor-verification.functions";
import { Logo } from "@/components/site/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";

const ADMIN_EMAIL = "divitfatehpuria7@gmail.com";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/login", requireRole: "admin" }),
  head: () => ({ meta: [{ title: "Admin — UniPlug" }] }),
  component: AdminPage,
});

type SectionKey = "dashboard" | "approvals" | "users" | "sessions" | "revenue";

const NAV: { key: SectionKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "approvals", label: "Mentor Approvals", icon: UserCheck },
  { key: "users", label: "All Users", icon: Users },
  { key: "sessions", label: "All Sessions", icon: CalendarClock },
  { key: "revenue", label: "Revenue", icon: TrendingUp },
];

interface Stats {
  total_students: number;
  total_mentors: number;
  sessions_this_month: number;
  revenue_this_month: number;
  total_revenue_all_time: number;
  total_sessions_all_time: number;
}

interface MentorRow {
  id: string;
  full_name: string;
  email: string;
  university: string;
  course: string;
  year: string;
  status: string;
  created_at: string;
  application_submitted_at: string | null;
}
interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  grade: string;
  school: string;
  created_at: string;
}
interface BookingRow {
  id: string;
  student_id: string;
  student_name: string | null;
  mentor_id: string;
  mentor_name: string | null;
  date: string;
  time_slot: string;
  status: string;
  price: number;
  created_at: string;
}

function AdminPage() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const [ready, setReady] = useState(!!ctx.userId);
  const [active, setActive] = useState<SectionKey>("dashboard");

  // SSR / hard-refresh fallback (see dashboard.tsx for the rationale).
  useEffect(() => {
    if (ctx.userId) return;
    let cancelled = false;
    void (async () => {
      const { data: sessionData, error: sessErr } = await withRetry(() =>
        supabase.auth.getSession(),
      );
      if (cancelled) return;
      if (sessErr) {
        navigate({ to: "/login" });
        return;
      }
      const email = sessionData?.session?.user.email?.toLowerCase();
      if (!sessionData?.session || email !== ADMIN_EMAIL) {
        navigate({ to: "/login" });
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, ctx.userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (!ready) return <div className="min-h-screen bg-[#FFFCFB]" />;

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[240px] flex-col bg-[#1A1A1A] md:flex">
        <Link to="/" className="flex items-center gap-2 px-6 pb-6 pt-7" aria-label="UniPlug home">
          <span className="inline-flex items-center rounded-lg bg-[#FFFCFB] p-1.5">
            <Logo className="h-7 w-auto" />
          </span>
        </Link>
        <div className="px-6 pb-4 text-[11px] uppercase tracking-wider text-white/40">Admin</div>
        <nav className="mt-1 flex flex-1 flex-col">
          {NAV.map((it) => {
            const isActive = it.key === active;
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                onClick={() => setActive(it.key)}
                className={`relative flex items-center gap-3 px-6 py-3 text-left text-[14px] font-medium transition ${
                  isActive ? "text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#C4907F]" />
                )}
                <Icon className="h-[18px] w-[18px]" />
                <span>{it.label}</span>
              </button>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="mx-4 mb-6 mt-2 inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[13px] font-medium text-white/70 transition hover:border-white/40 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto bg-[#1A1A1A] px-3 py-2 md:hidden">
        {NAV.map((it) => (
          <button
            key={it.key}
            onClick={() => setActive(it.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium ${
              active === it.key ? "bg-[#C4907F] text-white" : "text-white/70"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>

      <main className="md:ml-[240px]">
        <div className="mx-auto max-w-[1200px] px-5 pb-16 pt-6 sm:px-8 md:px-10 md:pt-10">
          <h1 className="font-[Fraunces] text-[32px] leading-tight text-[#1A1A1A] md:text-[36px]">
            {NAV.find((n) => n.key === active)?.label}
          </h1>
          <div className="mt-6">
            {active === "dashboard" && <DashboardSection />}
            {active === "approvals" && <ApprovalsSection />}
            {active === "users" && <UsersSection />}
            {active === "sessions" && <SessionsSection />}
            {active === "revenue" && <RevenueSection />}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#EDE0DB] p-6">
      <div className="text-[13px] font-medium text-[#1A1A1A]/70">{label}</div>
      <div className="mt-2 font-[Fraunces] text-[32px] leading-tight text-[#1A1A1A]">{value}</div>
    </div>
  );
}

const inr = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

function DashboardSection() {
  const { data, isLoading, isError, refetch } = useQuery<Stats | null>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return ((rows as Stats[] | null) ?? [])[0] ?? null;
    },
  });

  if (isError)
    return <ErrorBanner message="Couldn't load admin stats." onRetry={() => void refetch()} />;
  if (isLoading || !data) return <div className="text-[14px] text-[#1A1A1A]/60">Loading…</div>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard label="Total Students" value={String(data.total_students)} />
      <StatCard label="Total Mentors" value={String(data.total_mentors)} />
      <StatCard label="Sessions This Month" value={String(data.sessions_this_month)} />
      <StatCard label="Revenue This Month" value={inr(data.revenue_this_month)} />
    </div>
  );
}

function ApprovalsSection() {
  const qc = useQueryClient();
  const queryKey = ["admin-mentors-pending"] as const;

  const {
    data: rows = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<MentorRow[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_mentors", { _status: "pending" });
      if (error) throw error;
      // P8: only show SUBMITTED applications (docless/abandoned signups stay out).
      return ((data as MentorRow[] | null) ?? []).filter((m) => m.application_submitted_at != null);
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: "approved" | "rejected";
      reason?: string;
    }) => {
      // C (2026-06-04): named approve/reject RPCs (reject carries a reason →
      // stored + emailed). They emit the mentor decision email server-side.
      const { error } =
        status === "approved"
          ? await supabase.rpc("approve_mentor", { _mentor_id: id })
          : await supabase.rpc("reject_mentor", { _mentor_id: id, _reason: reason ?? null });
      if (error) throw error;
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<MentorRow[]>(queryKey) ?? [];
      qc.setQueryData<MentorRow[]>(
        queryKey,
        prev.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Status change failed.");
    },
    onSuccess: (_data, { status }) => {
      if (status === "approved") toast.success("Mentor approved");
      else toast.error("Mentor rejected");
    },
  });

  const mentorsBlock = isError ? (
    <ErrorBanner message="Couldn't load pending mentors." onRetry={() => void refetch()} />
  ) : isLoading ? (
    <div className="text-[14px] text-[#1A1A1A]/60">Loading…</div>
  ) : rows.length === 0 ? (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <p className="text-[15px] font-medium text-foreground">No mentors awaiting review</p>
      <p className="mt-1 text-[13px] font-light text-muted-foreground">
        New mentor applications will appear here for you to verify and approve.
      </p>
    </div>
  ) : (
    <div className="overflow-hidden rounded-xl border border-[#EDE0DB] bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>University</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead className="text-right">Documents &amp; decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <PendingMentorRow
              key={m.id}
              mentor={m}
              busy={setStatusMutation.isPending}
              onApprove={() => setStatusMutation.mutate({ id: m.id, status: "approved" })}
              onReject={() => {
                const reason =
                  window.prompt("Reason for rejecting this mentor (emailed to them):") ?? "";
                if (reason.trim() === "") return; // cancelled / empty → no-op
                setStatusMutation.mutate({ id: m.id, status: "rejected", reason: reason.trim() });
              }}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-8">
      {mentorsBlock}
      <AddRequestsReviewPanel />
    </div>
  );
}

type AddRequestRow = {
  id: string;
  kind: string;
  proposed_name: string;
  status: string;
  created_at: string;
};

// C (2026-06-04): admin review list for student-submitted ref add-requests
// (new universities/courses/etc.). Reader admin_list_add_requests + the existing
// admin_promote_ref_add_request / admin_reject_ref_add_request RPCs.
function AddRequestsReviewPanel() {
  const qc = useQueryClient();
  const queryKey = ["admin-add-requests-pending"] as const;
  const { data: rows = [], isLoading } = useQuery<AddRequestRow[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_add_requests", { _status: "pending" });
      if (error) throw error;
      return (data as AddRequestRow[] | null) ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "promote" | "reject" }) => {
      if (action === "promote") {
        const { error } = await supabase.rpc("admin_promote_ref_add_request", { _id: id });
        if (error) throw error;
      } else {
        const reason = window.prompt("Reason for rejecting this suggestion:") ?? "";
        if (reason.trim() === "") throw new Error("cancelled");
        const { error } = await supabase.rpc("admin_reject_ref_add_request", {
          _id: id,
          _reason: reason.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
    onError: (err) => {
      if (err instanceof Error && err.message === "cancelled") return;
      toast.error(err instanceof Error ? err.message : "Action failed.");
    },
  });

  return (
    <section>
      <h3 className="mb-3 text-[15px] font-medium text-foreground">Suggested additions</h3>
      {isLoading ? (
        <div className="text-[14px] text-[#1A1A1A]/60">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-[13px] font-light text-muted-foreground">
          No pending suggestions to review.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#EDE0DB] bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Proposed name</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="capitalize">{r.kind.replace(/_/g, " ")}</TableCell>
                  <TableCell>{r.proposed_name}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: r.id, action: "promote" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: r.id, action: "reject" })}
                    >
                      Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function PendingMentorRow({
  mentor,
  onApprove,
  onReject,
  busy,
}: {
  mentor: MentorRow;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  // Lazy, read-only fetch of short-lived signed URLs for this mentor's private
  // verification documents. Reviewing the docs is the natural step before
  // approving — the Approve dialog reminds the admin to do so.
  const docs = useMutation({
    mutationFn: async () => {
      const res = await getMentorVerificationDocs({ data: { mentorId: mentor.id } });
      if (!res.ok) throw new Error(res.reason);
      return res;
    },
  });

  const result = docs.data;
  const noneUploaded = result?.ok && !result.idDocumentUrl && !result.enrollmentLetterUrl;

  return (
    <TableRow>
      <TableCell className="font-medium">{mentor.full_name}</TableCell>
      <TableCell>{mentor.university}</TableCell>
      <TableCell>{mentor.course}</TableCell>
      <TableCell className="text-[#1A1A1A]/70">{mentor.email}</TableCell>
      <TableCell>{new Date(mentor.created_at).toLocaleDateString()}</TableCell>
      <TableCell className="text-right align-top">
        <div className="inline-flex flex-col items-end gap-2">
          <div className="inline-flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => docs.mutate()}
              disabled={docs.isPending}
              className="gap-1.5"
            >
              {docs.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              View documents
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={busy} className="bg-primary text-primary-foreground">
                  Approve
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-foreground">
                    Approve {mentor.full_name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Review their ID and enrollment documents first. Approving marks this mentor
                    verified — recording that you verified them, and when — and makes them bookable
                    by students. You can revert this later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onApprove}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Approve &amp; verify
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  Reject
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive">
                    Reject {mentor.full_name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This rejects the application and clears any recorded verification. The mentor
                    will not be bookable or shown as verified. You can change this later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onReject}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reject application
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Document review panel */}
          {docs.isError && (
            <p className="text-[12px] font-light text-destructive">
              Couldn&apos;t load documents right now — please try again.
            </p>
          )}
          {result?.ok && noneUploaded && (
            <p className="text-[12px] font-light text-muted-foreground">No documents uploaded.</p>
          )}
          {result?.ok && !noneUploaded && (
            <div className="flex flex-col items-end gap-1">
              {result.idDocumentUrl && (
                <a
                  href={result.idDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> ID document
                </a>
              )}
              {result.enrollmentLetterUrl && (
                <a
                  href={result.enrollmentLetterUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Enrollment letter
                </a>
              )}
              <span className="text-[11px] font-light text-muted-foreground">
                Links expire in ~5 min.
              </span>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function UsersSection() {
  const [q, setQ] = useState("");

  const {
    data: students = [],
    isError: sErr,
    refetch: refetchStudents,
  } = useQuery<StudentRow[]>({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_students");
      if (error) throw error;
      return (data as StudentRow[] | null) ?? [];
    },
  });

  const {
    data: mentors = [],
    isError: mErr,
    refetch: refetchMentors,
  } = useQuery<MentorRow[]>({
    queryKey: ["admin-mentors-all"],
    queryFn: async () => {
      // Omit _status to get all mentors (the SQL fn defaults _status to NULL,
      // which the function treats as "no filter"). Matches the pattern used
      // by admin_list_students / admin_list_bookings above.
      const { data, error } = await supabase.rpc("admin_list_mentors");
      if (error) throw error;
      return (data as MentorRow[] | null) ?? [];
    },
  });

  const filterFn = <T extends { full_name: string; email: string }>(arr: T[]) => {
    const term = q.trim().toLowerCase();
    if (!term) return arr;
    return arr.filter(
      (x) => x.full_name?.toLowerCase().includes(term) || x.email?.toLowerCase().includes(term),
    );
  };
  const fStudents = useMemo(() => filterFn(students), [students, q]);
  const fMentors = useMemo(() => filterFn(mentors), [mentors, q]);

  return (
    <div>
      {(sErr || mErr) && (
        <div className="mb-4">
          <ErrorBanner
            message="Couldn't load users."
            onRetry={() => {
              if (sErr) void refetchStudents();
              if (mErr) void refetchMentors();
            }}
          />
        </div>
      )}
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/40" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-9"
        />
      </div>
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students ({fStudents.length})</TabsTrigger>
          <TabsTrigger value="mentors">Mentors ({fMentors.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="students">
          <div className="overflow-hidden rounded-xl border border-[#EDE0DB] bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fStudents.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="text-[#1A1A1A]/70">{s.email}</TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span className="rounded-full bg-[#EDE0DB] px-2.5 py-0.5 text-[12px]">
                        Active
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="mentors">
          <div className="overflow-hidden rounded-xl border border-[#EDE0DB] bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fMentors.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.full_name}</TableCell>
                    <TableCell className="text-[#1A1A1A]/70">{m.email}</TableCell>
                    <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[12px] ${
                          m.status === "approved"
                            ? "bg-[#EDE0DB] text-[#1A1A1A]"
                            : m.status === "rejected"
                              ? "bg-red-100 text-[#991B1B]"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {m.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionsSection() {
  const {
    data: rows = [],
    isError,
    refetch,
  } = useQuery<BookingRow[]>({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_bookings");
      if (error) throw error;
      return (data as BookingRow[] | null) ?? [];
    },
  });

  if (isError)
    return <ErrorBanner message="Couldn't load sessions." onRetry={() => void refetch()} />;

  return (
    <div className="overflow-hidden rounded-xl border border-[#EDE0DB] bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Mentor</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.student_name ?? "—"}</TableCell>
              <TableCell>{b.mentor_name ?? "—"}</TableCell>
              <TableCell>{new Date(b.date).toLocaleDateString()}</TableCell>
              <TableCell>{b.time_slot}</TableCell>
              <TableCell>
                <span className="rounded-full bg-[#EDE0DB] px-2.5 py-0.5 text-[12px] capitalize">
                  {b.status}
                </span>
              </TableCell>
              <TableCell className="text-right">{inr(b.price)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-[#1A1A1A]/60">
                No sessions yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function RevenueSection() {
  const {
    data: stats,
    isError: sErr,
    refetch: refetchStats,
  } = useQuery<Stats | null>({
    queryKey: ["admin-stats-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return ((data as Stats[] | null) ?? [])[0] ?? null;
    },
  });
  const {
    data: rows = [],
    isError: bErr,
    refetch: refetchBookings,
  } = useQuery<BookingRow[]>({
    queryKey: ["admin-bookings-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_bookings");
      if (error) throw error;
      return (data as BookingRow[] | null) ?? [];
    },
  });

  if (sErr || bErr)
    return (
      <ErrorBanner
        message="Couldn't load revenue data."
        onRetry={() => {
          if (sErr) void refetchStats();
          if (bErr) void refetchBookings();
        }}
      />
    );

  const commission = stats ? Math.round(stats.total_revenue_all_time * 0.2) : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Revenue (All Time)"
          value={inr(stats?.total_revenue_all_time ?? 0)}
        />
        <StatCard label="Platform Commission (20%)" value={inr(commission)} />
        <StatCard label="Sessions This Month" value={String(stats?.sessions_this_month ?? 0)} />
      </div>
      <div className="overflow-hidden rounded-xl border border-[#EDE0DB] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Mentor</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{new Date(b.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">{b.student_name ?? "—"}</TableCell>
                <TableCell>{b.mentor_name ?? "—"}</TableCell>
                <TableCell className="text-right">{inr(b.price)}</TableCell>
                <TableCell className="text-right">{inr(Math.round(b.price * 0.2))}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-[#1A1A1A]/60">
                  No transactions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
