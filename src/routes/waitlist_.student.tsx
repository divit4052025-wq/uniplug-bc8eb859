// /waitlist/student — the mentee waitlist page (CD screen C). `kind` is fixed to
// "school" by this route. Un-nested from /waitlist via the trailing "_".

import { createFileRoute } from "@tanstack/react-router";

import waitlistCss from "@/components/waitlist/waitlist.css?url";
import { WaitlistRolePage } from "@/components/waitlist/WaitlistRolePage";
import { MENTEE_CONFIG } from "@/components/waitlist/role-configs";

export const Route = createFileRoute("/waitlist_/student")({
  head: () => ({
    meta: [
      { title: "Join the UniPlug waitlist — students" },
      {
        name: "description",
        content:
          "Save your place. Founding students get 1:1 video mentorship from verified college mentors the moment booking opens.",
      },
    ],
    links: [{ rel: "stylesheet", href: waitlistCss }],
  }),
  component: () => <WaitlistRolePage config={MENTEE_CONFIG} />,
});
