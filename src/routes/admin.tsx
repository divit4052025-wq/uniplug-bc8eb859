import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, UserCheck, Users, CalendarClock, TrendingUp, LogOut, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";

const ADMIN_EMAIL = "divitfatehpuria7@gmail.com";

export const Route = createFileRoute("/admin")({
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
  id: string; full_name: string; email: string; university: string;
  course: string; year: string; status: string; created_at: string;
}
interface StudentRow {
  id: string; full_name: string; email: string; grade: string; school: string; created_at: string;
}
interface BookingRow {
  id: string; student_id: string; student_name: string | null;
  mentor_id: string; mentor_name: string | null;
  date: string; time_slot: string; status: string; price: number; created_at: string;
}

function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<SectionKey>("dashboard");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const email = data.session?.user.email?.toLowerCase();
      if (!data.session || email !== ADMIN_EMAIL) {
        navigate({ to: "/login" });
        return;
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (!ready) return <div className="min-h-screen bg-[#FFFCFB]" />;

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[240px] flex-col bg-[#1A1A1A] md:flex">
        <Link to="/" className="flex items-center px-6 pb-6 pt-7" aria-label="UniPlug home">
          <Logo variant="umark-offwhite" className="h-9 w-auto" />
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
                {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#C4907F]" />}
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

      {/* mobile top nav */}
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
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    (supabase.rpc as any)("admin_stats").then(({ data, error }: any) => {
      if (error) { toast.error(error.message); return; }
      if (data && data[0]) setStats(data[0]);
    });
  }, []);
  if (!stats) return <div className="text-[14px] text-[#1A1A1A]/60">Loading…</div>;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard label="Total Students" value={String(stats.total_students)} />
      <StatCard label="Total Mentors" value={String(stats.total_mentors)} />
      <StatCard label="Sessions This Month" value={String(stats.sessions_this_month)} />
      <StatCard label="Revenue This Month" value={inr(stats.revenue_this_month)} />
    </div>
  );
}

function ApprovalsSection() {
  const [rows, setRows] = useState<MentorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_list_mentors", { _status: "pending" });
    if (error) toast.error(error.message);
    else setRows((data as MentorRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await (supabase.rpc as any)("admin_set_mentor_status", { _mentor_id: id, _status: status });
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((m) => m.id !== id));
    if (status === "approved") toast.success("Mentor approved");
    else toast.error("Mentor rejected");
  };

  if (loading) return <div className="text-[14px] text-[#1A1A1A]/60">Loading…</div>;
  if (rows.length === 0) return <div className="rounded-xl border border-[#EDE0DB] bg-white p-8 text-center text-[14px] text-[#1A1A1A]/60">No pending applications.</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-[#EDE0DB] bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>University</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.full_name}</TableCell>
              <TableCell>{m.university}</TableCell>
              <TableCell>{m.course}</TableCell>
              <TableCell className="text-[#1A1A1A]/70">{m.email}</TableCell>
              <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setStatus(m.id, "approved")}
                    className="bg-[#C4907F] text-white hover:bg-[#b3806f]"
                  >Approve</Button>
                  <Button
                    size="sm"
                    onClick={() => setStatus(m.id, "rejected")}
                    className="bg-[#991B1B] text-white hover:bg-[#7f1616]"
                  >Reject</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function UsersSection() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [mentors, setMentors] = useState<MentorRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (supabase.rpc as any)("admin_list_students").then(({ data }: any) => setStudents((data as StudentRow[]) ?? []));
    (supabase.rpc as any)("admin_list_mentors", { _status: null }).then(({ data }: any) => setMentors((data as MentorRow[]) ?? []));
  }, []);

  const filterFn = <T extends { full_name: string; email: string }>(arr: T[]) => {
    const term = q.trim().toLowerCase();
    if (!term) return arr;
    return arr.filter((x) => x.full_name?.toLowerCase().includes(term) || x.email?.toLowerCase().includes(term));
  };
  const fStudents = useMemo(() => filterFn(students), [students, q]);
  const fMentors = useMemo(() => filterFn(mentors), [mentors, q]);

  return (
    <div>
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
                    <TableCell><span className="rounded-full bg-[#EDE0DB] px-2.5 py-0.5 text-[12px]">Active</span></TableCell>
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
                      <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${
                        m.status === "approved" ? "bg-[#EDE0DB] text-[#1A1A1A]" :
                        m.status === "rejected" ? "bg-red-100 text-[#991B1B]" :
                        "bg-yellow-100 text-yellow-800"
                      }`}>{m.status}</span>
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
  const [rows, setRows] = useState<BookingRow[]>([]);
  useEffect(() => {
    (supabase.rpc as any)("admin_list_bookings").then(({ data, error }: any) => {
      if (error) toast.error(error.message);
      else setRows((data as BookingRow[]) ?? []);
    });
  }, []);
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
              <TableCell><span className="rounded-full bg-[#EDE0DB] px-2.5 py-0.5 text-[12px] capitalize">{b.status}</span></TableCell>
              <TableCell className="text-right">{inr(b.price)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={6} className="py-8 text-center text-[#1A1A1A]/60">No sessions yet.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function RevenueSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<BookingRow[]>([]);
  useEffect(() => {
    (supabase.rpc as any)("admin_stats").then(({ data }: any) => { if (data && data[0]) setStats(data[0]); });
    (supabase.rpc as any)("admin_list_bookings").then(({ data }: any) => setRows((data as BookingRow[]) ?? []));
  }, []);
  const commission = stats ? Math.round(stats.total_revenue_all_time * 0.2) : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Revenue (All Time)" value={inr(stats?.total_revenue_all_time ?? 0)} />
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
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-[#1A1A1A]/60">No transactions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}