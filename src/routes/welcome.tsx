// /welcome — the landing is now the homepage (/). This route is kept only as a
// permanent (server-side) redirect so existing links to /welcome still land on
// the homepage. The redirect runs in beforeLoad → it issues a real HTTP 301
// during SSR, so it works without JS (curl /welcome → 301, Location: /).

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/welcome")({
  beforeLoad: () => {
    throw redirect({ to: "/", statusCode: 301 });
  },
});
