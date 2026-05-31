import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "@/components/legal/LegalDocument";
import content from "../../legal-source/01_Terms_of_Service.md?raw";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — UniPlug" },
      { name: "description", content: "UniPlug Terms of Service." },
    ],
  }),
  component: () => <LegalDocument content={content} />,
});
