import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "@/components/legal/LegalDocument";
import content from "../../legal-source/04_Mentor_Agreement.md?raw";

export const Route = createFileRoute("/mentor-terms")({
  head: () => ({
    meta: [
      { title: "Mentor Terms — UniPlug" },
      { name: "description", content: "UniPlug Mentor Terms (Mentor Agreement)." },
    ],
  }),
  component: () => <LegalDocument content={content} />,
});
