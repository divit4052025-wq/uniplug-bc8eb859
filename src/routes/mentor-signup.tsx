import { createFileRoute } from "@tanstack/react-router";

import { MentorSignupWizardV2 } from "@/components/mentor-signup/v2/MentorSignupWizardV2";

export const Route = createFileRoute("/mentor-signup")({
  head: () => ({
    meta: [
      { title: "Become the Plug — Mentor with UniPlug" },
      {
        name: "description",
        content:
          "Apply to mentor Indian high school students on college admissions. Get paid for one-on-one sessions sharing your real journey.",
      },
      { property: "og:title", content: "Become the Plug — Mentor with UniPlug" },
      {
        property: "og:description",
        content: "Share your story. Open doors. Get paid for one-on-one mentorship sessions.",
      },
    ],
  }),
  component: MentorSignupWizardV2,
});
