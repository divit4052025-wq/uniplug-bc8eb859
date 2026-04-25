import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

const links = [
  { label: "About", to: "/" },
  { label: "How It Works", to: "/" },
  { label: "For Students", to: "/student-signup" },
  { label: "For Mentors", to: "/mentor-signup" },
  { label: "Terms", to: "/" },
  { label: "Privacy", to: "/" },
];

export function Footer() {
  return (
    <footer className="bg-[#1A1A1A]">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-14 md:flex-row md:items-start md:justify-between md:px-10">
        <div>
          <Logo variant="wordmark-dark" className="h-9 w-auto" />
          <p className="mt-3 text-[14px] font-light text-[#E8C4B8]">Find Your Plug</p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-[#EDE0DB]/60 transition hover:text-[#EDE0DB]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/5 px-6 py-5 text-center text-[12px] text-[#EDE0DB]/40 md:px-10">
        © {new Date().getFullYear()} UniPlug. All rights reserved.
      </div>
    </footer>
  );
}
