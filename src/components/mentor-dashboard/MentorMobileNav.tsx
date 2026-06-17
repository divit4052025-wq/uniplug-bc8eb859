import { Link, useRouterState } from "@tanstack/react-router";
import { MENTOR_NAV, isMentorNavActive } from "./MentorSidebar";

export function MentorMobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-white/10 bg-[#1A1A1A] md:hidden">
      {MENTOR_NAV.map((it) => {
        const Icon = it.icon;
        const isActive = isMentorNavActive(pathname, it.to, it.exact);
        return (
          <Link
            key={it.key}
            to={it.to}
            aria-label={it.label}
            aria-current={isActive ? "page" : undefined}
            className="flex h-14 items-center justify-center"
          >
            <Icon
              className="h-5 w-5 transition"
              style={{ color: isActive ? "#C4907F" : "rgba(255,255,255,0.55)" }}
            />
          </Link>
        );
      })}
    </nav>
  );
}
