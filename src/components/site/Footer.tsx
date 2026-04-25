import { Link } from "@tanstack/react-router";
import logo from "@/assets/uniplug-logo.png";

export function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-3">
        <div>
          <div className="inline-flex items-center rounded-xl bg-background p-2">
            <img src={logo} alt="UniPlug" className="h-8 w-auto" />
          </div>
          <p className="mt-4 font-display text-xl text-secondary">Find Your Plug</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:col-span-2 md:grid-cols-3">
          {[
            { label: "About", to: "/" },
            { label: "How It Works", to: "/" },
            { label: "For Students", to: "/student-signup" },
            { label: "For Mentors", to: "/mentor-signup" },
            { label: "Terms", to: "/" },
            { label: "Privacy", to: "/" },
          ].map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-background/70 transition hover:text-secondary"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="border-t border-background/10 px-5 py-5 text-center text-xs text-background/50 sm:px-8">
        © {new Date().getFullYear()} UniPlug. Built with warmth.
      </div>
    </footer>
  );
}
