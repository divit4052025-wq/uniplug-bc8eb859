import { createFileRoute } from "@tanstack/react-router";

import { FinalizeMentor } from "@/components/mentor-signup/FinalizeMentor";
import { clientAuthGuard } from "@/lib/auth/route-guard";

// `mentor-signup_.finalize` → /mentor-signup/finalize, WITHOUT nesting under the
// mentor-signup page (the `_` opts out of the parent layout). Mentors only.
export const Route = createFileRoute("/mentor-signup_/finalize")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/mentor-signup", requireRole: "mentor" }),
  head: () => ({
    meta: [{ title: "Submit your application — UniPlug" }],
  }),
  component: FinalizeMentor,
});
