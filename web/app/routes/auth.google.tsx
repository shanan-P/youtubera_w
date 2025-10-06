import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, commitSession } from "~/utils/session.server";
import { randomBytes } from "node:crypto";

function getOrigin(request: Request) {
  return new URL(request.url).origin;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") ?? "/profile";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Response("Google OAuth not configured", { status: 500 });
  }

  const session = await getSession(request.headers.get("Cookie") ?? undefined);
  const state = randomBytes(16).toString("hex");
  session.set("oauth_state_google", state);
  session.set("oauth_redirectTo", redirectTo);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${getOrigin(request)}/auth/google/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  return redirect(authUrl.toString(), { headers: { "Set-Cookie": await commitSession(session) } });
}

export default function GoogleAuth() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
      <h2 className="text-xl font-semibold">Redirecting to Google...</h2>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-main-accent border-t-transparent" />
    </div>
  );
}