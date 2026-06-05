import { createFileRoute } from "@tanstack/react-router";

import { MentorSignupWizard } from "@/components/mentor-signup/MentorSignupWizard";

export const Route = createFileRoute("/mentor-signup")({
  head: () => ({
    meta: [
      { title: "Become a Plug — Mentor with UniPlug" },
      {
        name: "description",
        content:
          "Apply to mentor Indian high school students on college admissions. Get paid for one-on-one sessions sharing your real journey.",
      },
      { property: "og:title", content: "Become a Plug — Mentor with UniPlug" },
      {
        property: "og:description",
        content: "Share your story. Open doors. Get paid for one-on-one mentorship sessions.",
      },
    ],
  }),
  component: MentorSignupWizard,
});
