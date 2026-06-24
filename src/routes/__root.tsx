import { useEffect, useState } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "../lib/queryClient";
import { enforceEphemeralOnColdStart } from "../lib/ephemeral-session";
import { Toaster } from "../components/ui/sonner";
import { NotFound } from "../components/site/NotFound";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "UniPlug — Your College Plug On Demand" },
      {
        name: "description",
        content:
          "Paid 1:1 mentorship from verified university students for Indian high school applicants.",
      },
      { name: "author", content: "UniPlug" },
      { property: "og:title", content: "UniPlug — Your College Plug On Demand" },
      {
        property: "og:description",
        content:
          "Paid 1:1 mentorship from verified university students for Indian high school applicants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@UniPlug" },
      { name: "twitter:title", content: "UniPlug — Your College Plug On Demand" },
      {
        name: "twitter:description",
        content:
          "Paid 1:1 mentorship from verified university students for Indian high school applicants.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1dacac0b-79aa-4cf2-8f16-3c3af97a5ded/id-preview-c05b28aa--5cc19c47-329a-453c-bd82-fa4de39a707e.lovable.app-1777110848194.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1dacac0b-79aa-4cf2-8f16-3c3af97a5ded/id-preview-c05b28aa--5cc19c47-329a-453c-bd82-fa4de39a707e.lovable.app-1777110848194.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(() => createQueryClient());

  // Session-only logins ("Keep me logged in" left unchecked) are signed out on a
  // cold browser start. Client-only + cross-tab safe; see lib/ephemeral-session.
  useEffect(() => {
    enforceEphemeralOnColdStart();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
