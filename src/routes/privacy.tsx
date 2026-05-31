import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "@/components/legal/LegalDocument";
import content from "../../legal-source/02_Privacy_Policy.md?raw";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — UniPlug" },
      { name: "description", content: "UniPlug Privacy Policy." },
    ],
  }),
  component: () => <LegalDocument content={content} />,
});
