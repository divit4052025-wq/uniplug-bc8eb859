import {
  LayoutDashboard,
  ShieldAlert,
  BadgeCheck,
  Users,
  HeartHandshake,
  CalendarClock,
  Receipt,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

/**
 * Admin operator-console module navigation. Single source of truth for the
 * sidebar. Each phase of the console build flips its module from "soon" to
 * "active" and ships the matching /admin/<path> route. "soon" items render as
 * disabled (honest: the surface genuinely is not built yet) — never as a dead
 * link or a fake-working tab.
 */
export interface AdminNavItem {
  key: string;
  label: string;
  /** Router path. The Overview is the index route at "/admin". */
  to: string;
  icon: LucideIcon;
  status: "active" | "soon";
  /** Short hint shown on disabled items. */
  hint?: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { key: "overview", label: "Overview", to: "/admin", icon: LayoutDashboard, status: "active" },
  {
    key: "safeguarding",
    label: "Safeguarding",
    to: "/admin/safeguarding",
    icon: ShieldAlert,
    status: "active",
  },
  {
    key: "verification",
    label: "Verification",
    to: "/admin/verification",
    icon: BadgeCheck,
    status: "active",
  },
  {
    key: "users",
    label: "Users",
    to: "/admin/users",
    icon: Users,
    status: "soon",
    hint: "directory",
  },
  {
    key: "consent",
    label: "Consent",
    to: "/admin/consent",
    icon: HeartHandshake,
    status: "soon",
    hint: "minors",
  },
  {
    key: "bookings",
    label: "Bookings",
    to: "/admin/bookings",
    icon: CalendarClock,
    status: "soon",
    hint: "ledger",
  },
  {
    key: "payments",
    label: "Payments",
    to: "/admin/payments",
    icon: Receipt,
    status: "soon",
    hint: "read-only",
  },
  { key: "audit", label: "Audit Log", to: "/admin/audit", icon: ScrollText, status: "active" },
];
