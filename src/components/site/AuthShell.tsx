import { Nav } from "./Nav";
import { Footer } from "./Footer";
import logo from "@/assets/uniplug-logo.png";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[1fr_1.1fr] md:gap-14">
          <div className="animate-fade-in md:sticky md:top-28 md:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {eyebrow}
            </p>
            <h1 className="mt-3 font-display text-5xl text-foreground sm:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-md text-base font-light text-muted-foreground">
              {subtitle}
            </p>
          </div>
          <div className="animate-fade-up rounded-3xl bg-card p-7 shadow-card sm:p-10">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-foreground/70">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-light text-foreground placeholder:text-muted-foreground/60 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15";

export function Confirmation({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Nav />
      <main className="flex flex-1 items-center justify-center px-5 py-24 sm:px-8">
        <div className="animate-fade-up max-w-xl rounded-3xl bg-card p-10 text-center shadow-lift sm:p-14">
          <div className="mx-auto inline-flex items-center justify-center rounded-2xl bg-background p-3 shadow-card">
            <img src={logo} alt="UniPlug" className="h-12 w-auto" />
          </div>
          <h2 className="mt-6 font-display text-3xl text-foreground sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-3 text-base font-light text-muted-foreground">{body}</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
