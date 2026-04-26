import umarkOffwhite from "@/assets/logos/umark-offwhite.png";
import umarkDark from "@/assets/logos/umark-dark.png";
import umarkSand from "@/assets/logos/umark-sand.png";
import umarkRose from "@/assets/logos/umark-rose.png";
import umarkBlush from "@/assets/logos/umark-blush.png";
import wordmarkDark from "@/assets/logos/wordmark-dark.png";
import wordmarkOffwhite from "@/assets/logos/wordmark-offwhite.png";
import wordmarkSand from "@/assets/logos/wordmark-sand.png";
import wordmarkBlush from "@/assets/logos/wordmark-blush.png";

const SOURCES = {
  "umark-offwhite": umarkOffwhite,
  "umark-dark": umarkDark,
  "umark-sand": umarkSand,
  "umark-rose": umarkRose,
  "umark-blush": umarkBlush,
  "wordmark-dark": wordmarkDark,
  "wordmark-offwhite": wordmarkOffwhite,
  "wordmark-sand": wordmarkSand,
  "wordmark-blush": wordmarkBlush,
} as const;

export type LogoVariant = keyof typeof SOURCES;

export function Logo({
  variant = "umark-offwhite",
  className = "h-9 w-auto",
}: {
  variant?: LogoVariant;
  className?: string;
}) {
  return (
    <img
      src={SOURCES[variant]}
      alt="UniPlug"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
