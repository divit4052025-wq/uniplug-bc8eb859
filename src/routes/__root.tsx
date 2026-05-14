import { useState } from "react";
import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "../lib/queryClient";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "UniPlug — Your College Plug On Demand" },
      { name: "description", content: "Paid 1:1 mentorship from verified university students for Indian high school applicants." },
      { name: "author", content: "UniPlug" },
      { property: "og:title", content: "UniPlug — Your College Plug On Demand" },
      { property: "og:description", content: "Paid 1:1 mentorship from verified university students for Indian high school applicants." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@UniPlug" },
      { name: "twitter:title", content: "UniPlug — Your College Plug On Demand" },
      { name: "twitter:description", content: "Paid 1:1 mentorship from verified university students for Indian high school applicants." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1dacac0b-79aa-4cf2-8f16-3c3af97a5ded/id-preview-c05b28aa--5cc19c47-329a-453c-bd82-fa4de39a707e.lovable.app-1777110848194.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1dacac0b-79aa-4cf2-8f16-3c3af97a5ded/id-preview-c05b28aa--5cc19c47-329a-453c-bd82-fa4de39a707e.lovable.app-1777110848194.png" },
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
  notFoundComponent: NotFoundComponent,
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
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
