import type { LinksFunction, MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import stylesheet from "./tailwind.css?url";
import { getUser } from "~/utils/auth.server";
import { ThemeProvider } from "./components/ThemeContext";
import { Layout } from "./components/Layout";

export const meta: MetaFunction = () => ([
  { charset: "utf-8" },
  { title: "Youtubera" },
  { name: "viewport", content: "width=device-width,initial-scale=1" }
]);

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&display=swap" },
  { rel: "stylesheet", href: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" },
  { rel: "stylesheet", href: "https://cdn.jsdelivr.net/gh/repalash/gilroy-free-webfont@fonts/Gilroy-Light.css" },
  { rel: "stylesheet", href: "https://cdn.jsdelivr.net/gh/repalash/gilroy-free-webfont@fonts/Gilroy-ExtraBold.css" },
  {
    rel: "icon",
    href:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='2' fill='%23000'/%3E%3Ctext x='8' y='12' font-size='10' text-anchor='middle' fill='%23fff' font-family='Arial,Helvetica,sans-serif'%3EY%3C/text%3E%3C/svg%3E"
  }
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  return json({ user });
}

export default function App() {
  return (
    <ThemeProvider>
      <Main />
    </ThemeProvider>
  );
}

function Main() {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <Meta />
        <Links />
      </head>
      <body className="min-h-full bg-main-bg text-main-text">
        <Layout>
          <Outlet />
        </Layout>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}