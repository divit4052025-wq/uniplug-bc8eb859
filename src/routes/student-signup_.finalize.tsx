import { createFileRoute } from "@tanstack/react-router";

import { FinalizeProfile } from "@/components/student-signup/FinalizeProfile";
import { clientAuthGuard } from "@/lib/auth/route-guard";

// `student-signup_.finalize` → /student-signup/finalize, WITHOUT nesting under
// the student-signup page (the `_` opts out of the parent layout, mirroring
// messages_.$conversationId). Authenticated students only.
export const Route = createFileRoute("/student-signup_/finalize")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/student-signup", requireRole: "student" }),
  head: () => ({
    meta: [{ title: "Finish your profile — UniPlug" }],
  }),
  component: FinalizeProfile,
});
