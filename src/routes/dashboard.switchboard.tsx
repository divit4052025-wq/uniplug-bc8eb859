import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Mascot, type MascotShape } from "@/components/mascots/Mascot";
import { mascotForSpecialty } from "@/components/mascots/specialty";
import {
  QuarterPageShell,
  QuarterError,
  QuarterEmpty,
} from "@/components/student-quarter/QuarterPageShell";
import { AwaitingConsentNotice } from "@/components/consent/AwaitingConsentNotice";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// The Switchboard ← /browse. Discovery + filter + a clean mentor-card GRID
// (mentors are never world buildings). Real data via list_approved_mentor_profiles;
// each card opens the real mentor profile + booking flow at /mentor/$id. Honest
// loading/error/empty — never a fabricated mentor.
export const Route = createFileRoute("/dashboard/switchboard")({
  component: SwitchboardPage,
});

type MentorProfile = {
  id: string;
  full_name: string;
  university: string;
  countries: string[] | null;
  course: string;
  year: string;
  price_inr: number;
  verified_at: string | null;
  mascot_key: string | null;
};
type Mentor = {
  id: string;
  name: string;
  university: string;
  course: string;
  year: string;
  price: number;
  verified: boolean;
  mascot: MascotShape;
};

const COURSES = ["Engineering", "Business", "Science", "Social Sciences", "Arts", "Medicine"];

function SwitchboardPage() {
  const { userId, consent } = useStudentDashboard();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState<string | null>(null);

  const {
    data: mentors = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Mentor[]>({
    queryKey: ["switchboard", "approved-mentors"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_approved_mentor_profiles");
      if (error) throw error;
      return ((data ?? []) as MentorProfile[]).map((m) => ({
        id: m.id,
        name: m.full_name,
        university: m.university,
        course: m.course,
        year: m.year,
        price: m.price_inr,
        verified: m.verified_at != null,
        mascot: mascotForSpecialty(m.mascot_key),
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mentors.filter(
      (m) =>
        (!course || m.course === course) &&
        (!q || m.name.toLowerCase().includes(q) || (m.university ?? "").toLowerCase().includes(q)),
    );
  }, [mentors, search, course]);

  return (
    <QuarterPageShell
      kind="Find your Plug"
      title="The Switchboard"
      intro="Search and filter mentors who’ve been exactly where you want to go, then book."
    >
      {consent?.awaiting && (
        <div style={{ marginBottom: 20 }}>
          <AwaitingConsentNotice studentId={userId} parentEmail={consent.parentEmail} compact />
        </div>
      )}

      <div className="q-browse">
        <aside className="q-filter">
          <div className="q-filter">
            <div className="fsearch">
              <input
                type="text"
                placeholder="Search name or university"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search mentors"
              />
            </div>
          </div>
          <div className="q-fgroup">
            <div className="fg-t">Course</div>
            <div className="q-chipset">
              {COURSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`q-chiptog ${course === c ? "on" : ""}`}
                  onClick={() => setCourse(course === c ? null : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div>
          {isLoading ? (
            <div className="q-mentors">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="q-shimmer" style={{ height: 184, borderRadius: 20 }} />
              ))}
            </div>
          ) : isError ? (
            <QuarterError>
              Couldn’t load mentors right now.{" "}
              <button
                type="button"
                className="qbtn qbtn-sm qbtn-ghost"
                style={{ marginLeft: 8 }}
                onClick={() => refetch()}
              >
                Try again
              </button>
            </QuarterError>
          ) : filtered.length === 0 ? (
            <QuarterEmpty title="No Plugs match yet">
              {mentors.length === 0
                ? "No mentors are available just yet — check back soon."
                : "Try clearing a filter or searching a different name."}
            </QuarterEmpty>
          ) : (
            <>
              <p
                style={{ fontWeight: 700, fontSize: 13, color: "var(--q-ink55)", marginBottom: 14 }}
              >
                {filtered.length} {filtered.length === 1 ? "Plug" : "Plugs"}
              </p>
              <div className="q-mentors">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="q-mentor"
                    style={{ textAlign: "left" }}
                    onClick={() => navigate({ to: "/mentor/$id", params: { id: m.id } })}
                  >
                    <div className="mh">
                      <div className="av">
                        <Mascot
                          shape={m.mascot}
                          color="#F4B5AA"
                          size={44}
                          idle={false}
                          decorative
                        />
                      </div>
                      <div>
                        <div className="nm">{m.name}</div>
                        <div className="uni">{m.university}</div>
                        <div className="cy">
                          {m.course} · {m.year}
                        </div>
                      </div>
                    </div>
                    <div className="foot">
                      <span
                        className={`q-verified`}
                        style={{ visibility: m.verified ? "visible" : "hidden" }}
                      >
                        Verified
                      </span>
                      <span className="price">
                        ₹{m.price.toLocaleString("en-IN")}
                        <span> /session</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </QuarterPageShell>
  );
}
