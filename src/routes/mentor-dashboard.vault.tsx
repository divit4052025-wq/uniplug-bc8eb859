import { createFileRoute } from "@tanstack/react-router";

import { VaultPage } from "@/components/mentor-hq/pages/VaultPage";

// The Vault (/mentor-dashboard/vault) — earnings (ledger-sourced). Approval-only.
export const Route = createFileRoute("/mentor-dashboard/vault")({
  component: VaultPage,
});
