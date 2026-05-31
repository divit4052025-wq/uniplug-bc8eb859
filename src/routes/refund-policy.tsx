import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "@/components/legal/LegalDocument";
import content from "../../legal-source/05_Refund_Cancellation_Policy.md?raw";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund & Cancellation Policy — UniPlug" },
      { name: "description", content: "UniPlug Refund & Cancellation Policy." },
    ],
  }),
  component: () => <LegalDocument content={content} />,
});
