import logo from "@/assets/uniplug-logo.png";

export function Logo({ className = "h-9 w-auto" }: { className?: string }) {
  return <img src={logo} alt="UniPlug" className={className} />;
}
