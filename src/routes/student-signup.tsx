import { createFileRoute } from "@tanstack/react-router";

import { SignupWizard } from "@/components/student-signup/SignupWizard";

export const Route = createFileRoute("/student-signup")({
  head: () => ({
    meta: [
      { title: "Find Your Plug — UniPlug for Students" },
      {
        name: "description",
        content:
          "Sign up to get matched with verified university student mentors for one-on-one college admissions guidance.",
      },
      { property: "og:title", content: "Find Your Plug — UniPlug for Students" },
      {
        property: "og:description",
        content:
          "Real advice, real stories, real results — from students already living your dream.",
      },
    ],
  }),
  component: SignupWizard,
});
