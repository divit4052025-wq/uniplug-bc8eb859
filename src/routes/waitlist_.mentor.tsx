// /waitlist/mentor — the mentor waitlist page (CD screen D). `kind` is fixed to
// "college" by this route. Un-nested from /waitlist via the trailing "_".

import { createFileRoute } from "@tanstack/react-router";

import waitlistCss from "@/components/waitlist/waitlist.css?url";
import { WaitlistRolePage } from "@/components/waitlist/WaitlistRolePage";
import { MENTOR_CONFIG } from "@/components/waitlist/role-configs";

export const Route = createFileRoute("/waitlist_/mentor")({
  head: () => ({
    meta: [
      { title: "Join the UniPlug waitlist — mentors" },
      {
        name: "description",
        content:
          "Become the Plug you needed. Founding mentors keep 75% of every session — UniPlug handles scheduling, payments and safety.",
      },
    ],
    links: [{ rel: "stylesheet", href: waitlistCss }],
  }),
  component: () => <WaitlistRolePage config={MENTOR_CONFIG} />,
});
