import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Filter, Search, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar, type SectionKey } from "@/components/dashboard/DashboardSidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { BookingModal, type BookingMentor } from "@/components/booking/BookingModal";

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse Plugs — UniPlug" },
      { name: "description", content: "Discover and filter university student mentors for college admissions guidance." },
      { property: "og:title", content: "Browse Plugs — UniPlug" },
      { property: "og:description", content: "Discover and filter university student mentors for college admissions guidance." },
    ],
  }),
  component: BrowsePage,
});

const COUNTRIES = ["India", "UK", "USA", "Canada", "Australia", "Singapore", "Europe"];
const COURSES = ["Engineering", "Business", "Law", "Medicine", "Arts", "Science", "Social Sciences", "Other"];
const YEARS = ["1st Year", "2nd Year", "3rd Year", "Final Year"];
const SORTS = ["Relevance", "Rating", "Price Low to High", "Price High to Low"];

type Mentor = {
  id: string;
  name: string;
  university: string;
  country: string;
  course: string;
  year: string;
  topics: [string, string];
  price: number;
};

type MentorProfile = {
  id: string;
  full_name: string;
  university: string;
  countries: string[];
  course: string;
  year: string;
  price_inr: number;
};

function BrowsePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<SectionKey>("browse");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [booking, setBooking] = useState<Mentor | null>(null);
  const [mentors, setMentors] = useState<Mentor[]>([]);

  const [search, setSearch] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [universityQuery, setUniversityQuery] = useState("");
  const [courses, setCourses] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [sort, setSort] = useState("Relevance");

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/student-signup" });
        return;
      }
      const { data: profiles } = await (supabase as any).rpc("list_approved_mentor_profiles");
      setMentors((profiles ?? []).map((m: MentorProfile) => ({
        id: m.id,
        name: m.full_name,
        university: m.university,
        country: m.countries?.[0] ?? "Other",
        course: m.course,
        year: m.year,
        topics: [m.course, m.year],
        price: m.price_inr,
      })));
      setReady(true);
    };
    void init();
  }, [navigate]);

  const onSelectSection = (key: SectionKey) => {
    setActive(key);
    if (key === "home" || key === "sessions" || key === "documents") {
      navigate({ to: "/dashboard" });
    }
  };

  const toggle = (list: string[], setter: (v: string[]) => void, val: string) =>
    setter(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);

  const clearAll = () => {
    setSearch(""); setCountries([]); setUniversityQuery(""); setCourses([]); setYears([]); setSort("Relevance");
  };

  const filtered = useMemo(() => {
    let list = mentors.filter((m) => {
      if (search && !`${m.name} ${m.university}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (countries.length && !countries.includes(m.country)) return false;
      if (universityQuery && !m.university.toLowerCase().includes(universityQuery.toLowerCase())) return false;
      if (courses.length && !courses.includes(m.course)) return false;
      if (years.length && !years.includes(m.year)) return false;
      return true;
    });
    if (sort === "Rating") list = [...list];
    if (sort === "Price Low to High") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "Price High to Low") list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [search, countries, universityQuery, courses, years, sort, mentors]);

  if (!ready) return <div className="min-h-screen bg-[#FFFCFB]" />;

  const filterPanel = (
    <FilterPanel
      search={search} setSearch={setSearch}
      countries={countries} toggleCountry={(v) => toggle(countries, setCountries, v)}
      universityQuery={universityQuery} setUniversityQuery={setUniversityQuery}
      courses={courses} toggleCourse={(v) => toggle(courses, setCourses, v)}
      years={years} toggleYear={(v) => toggle(years, setYears, v)}
      sort={sort} setSort={setSort}
      clearAll={clearAll}
    />
  );

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <DashboardSidebar active={active} onSelect={onSelectSection} />

      <main className="md:ml-[240px]">
        {/* Mobile filter button */}
        <div className="flex items-center justify-between border-b border-[#EDE0DB] px-5 py-4 md:hidden">
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-[#1A1A1A]">Browse Plugs</h1>
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#C4907F] px-4 py-2 text-[13px] font-medium text-[#FFFCFB]"
          >
            <Filter className="h-4 w-4" /> Filter
          </button>
        </div>

        <div className="flex">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 overflow-y-auto border-r border-[#EDE0DB] bg-[#FFFCFB] md:block">
            {filterPanel}
          </aside>

          {/* Grid */}
          <section className="flex-1 px-5 pb-28 pt-6 sm:px-8 md:px-10 md:pb-12 md:pt-10">
            <div className="mb-6 hidden md:block">
              <h1 className="font-display text-[28px] font-semibold tracking-tight text-[#1A1A1A]">Browse Plugs</h1>
              <p className="mt-1 text-[14px] text-[#1A1A1A]/60">Find a mentor who's been exactly where you want to go.</p>
            </div>
            <p className="mb-4 text-[13px] text-[#1A1A1A]/60">{filtered.length} mentor{filtered.length === 1 ? "" : "s"}</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((m) => <MentorCard key={m.id} mentor={m} onBook={() => setBooking(m)} />)}
            </div>
            {filtered.length === 0 && (
              <div className="mt-12 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-10 text-center">
                <p className="font-display text-[18px] text-[#1A1A1A]">No mentors match those filters.</p>
                <button onClick={clearAll} className="mt-4 rounded-full bg-[#C4907F] px-5 py-2 text-[13px] font-medium text-[#FFFCFB]">Clear filters</button>
              </div>
            )}
          </section>
        </div>
      </main>

      <MobileBottomNav active={active} onSelect={onSelectSection} />

      {booking && (
        <BookingModal
          mentor={{ id: booking.id, name: booking.name, university: booking.university, price: booking.price } satisfies BookingMentor}
          onClose={() => setBooking(null)}
          onBooked={() => { setBooking(null); navigate({ to: "/dashboard" }); }}
        />
      )}

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-[#FFFCFB]">
            <div className="sticky top-0 flex items-center justify-between border-b border-[#EDE0DB] bg-[#FFFCFB] px-5 py-4">
              <h2 className="font-display text-[18px] font-semibold text-[#1A1A1A]">Filters</h2>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close filters">
                <X className="h-5 w-5 text-[#1A1A1A]" />
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPanel({
  search, setSearch, countries, toggleCountry, universityQuery, setUniversityQuery,
  courses, toggleCourse, years, toggleYear, sort, setSort, clearAll,
}: {
  search: string; setSearch: (v: string) => void;
  countries: string[]; toggleCountry: (v: string) => void;
  universityQuery: string; setUniversityQuery: (v: string) => void;
  courses: string[]; toggleCourse: (v: string) => void;
  years: string[]; toggleYear: (v: string) => void;
  sort: string; setSort: (v: string) => void;
  clearAll: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-6">
      <h2 className="font-display text-[20px] font-semibold tracking-tight text-[#1A1A1A]">Find Your Plug</h2>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/40" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or university"
          className="w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] py-2.5 pl-9 pr-3 text-[13px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
        />
      </div>

      <Section title="Country">
        <div className="space-y-2">
          {COUNTRIES.map((c) => (
            <CheckRow key={c} label={c} checked={countries.includes(c)} onChange={() => toggleCountry(c)} />
          ))}
        </div>
      </Section>

      <Section title="University">
        <input
          value={universityQuery} onChange={(e) => setUniversityQuery(e.target.value)}
          placeholder="e.g. Oxford"
          className="w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-3 py-2.5 text-[13px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
        />
      </Section>

      <Section title="Course">
        <div className="space-y-2">
          {COURSES.map((c) => (
            <CheckRow key={c} label={c} checked={courses.includes(c)} onChange={() => toggleCourse(c)} />
          ))}
        </div>
      </Section>

      <Section title="Year of Study">
        <div className="space-y-2">
          {YEARS.map((y) => (
            <CheckRow key={y} label={y} checked={years.includes(y)} onChange={() => toggleYear(y)} />
          ))}
        </div>
      </Section>

      <Section title="Sort By">
        <select
          value={sort} onChange={(e) => setSort(e.target.value)}
          className="w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-3 py-2.5 text-[13px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
        >
          {SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Section>

      <button
        onClick={clearAll}
        className="mt-2 w-full rounded-full bg-[#C4907F] py-2.5 text-[13px] font-medium text-[#FFFCFB] transition hover:opacity-90"
      >
        Clear all filters
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#EDE0DB] pt-4">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-[#1A1A1A]/70">{title}</h3>
      {children}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#1A1A1A]">
      <input
        type="checkbox" checked={checked} onChange={onChange}
        className="h-4 w-4 rounded border-[#EDE0DB] accent-[#C4907F]"
      />
      <span>{label}</span>
    </label>
  );
}

function MentorCard({ mentor, onBook }: { mentor: Mentor; onBook: () => void }) {
  const initials = mentor.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <article className="group flex flex-col rounded-2xl border border-[#E8C4B8] bg-[#EDE0DB] p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(26,26,26,0.25)]">
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="grid h-16 w-16 place-content-center rounded-full bg-[#FFFCFB] font-display text-[20px] font-semibold text-[#1A1A1A]">
            {initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-content-center rounded-full bg-[#C4907F] ring-2 ring-[#EDE0DB]">
            <BadgeCheck className="h-3.5 w-3.5 text-[#FFFCFB]" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[18px] font-bold leading-tight text-[#1A1A1A]">{mentor.name}</h3>
          <p className="mt-0.5 text-[14px] text-[#C4907F]">{mentor.university}</p>
          <p className="mt-0.5 text-[13px] text-[#1A1A1A]/60">{mentor.course} · {mentor.year}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {mentor.topics.map((t) => (
          <span key={t} className="rounded-full bg-[#1A1A1A] px-2.5 py-1 text-[11px] font-medium text-[#FFFCFB]">{t}</span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-[13px] text-[#1A1A1A]/70">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-[#C4907F] text-[#C4907F]" />
          <span className="font-medium text-[#1A1A1A]">Verified</span>
        </span>
        <span>₹{mentor.price.toLocaleString("en-IN")}</span>
      </div>

      <button onClick={onBook} className="mt-5 w-full rounded-full bg-[#C4907F] py-2.5 text-[13px] font-medium text-[#FFFCFB] transition hover:opacity-90">
        Book Now
      </button>
    </article>
  );
}