import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "@/components/legal/LegalDocument";
import content from "../../legal-source/07_Cookie_Policy.md?raw";

export const Route = createFileRoute("/cookie-policy")({
  head: () => ({
    meta: [
      { title: "Cookie & Local Storage Policy — UniPlug" },
      { name: "description", content: "UniPlug Cookie & Local Storage Policy." },
    ],
  }),
  component: () => <LegalDocument content={content} />,
});
