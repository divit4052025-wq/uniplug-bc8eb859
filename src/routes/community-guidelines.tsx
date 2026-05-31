import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "@/components/legal/LegalDocument";
import content from "../../legal-source/06_Community_Guidelines_Safeguarding.md?raw";

export const Route = createFileRoute("/community-guidelines")({
  head: () => ({
    meta: [
      { title: "Community Guidelines & Safeguarding — UniPlug" },
      {
        name: "description",
        content: "UniPlug Community Guidelines & Safeguarding Code.",
      },
    ],
  }),
  component: () => <LegalDocument content={content} />,
});
