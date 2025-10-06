import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, commitSession } from "~/utils/session.server";
import { getUserId } from "~/utils/auth.server";
import { randomBytes } from "node:crypto";

function getOrigin(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") ?? "/profile";
  // If already logged in, skip OAuth to avoid loops
  const existingUserId = await getUserId(request);
  if (existingUserId) {
    return redirect(redirectTo);
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Response("GitHub OAuth not configured", { status: 500 });
  }

  const session = await getSession(request.headers.get("Cookie") ?? undefined);
  const state = randomBytes(16).toString("hex");
  session.set("oauth_state_github", state);
  session.set("oauth_redirectTo", redirectTo);

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${getOrigin(request)}/auth/github/callback`);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  authorizeUrl.searchParams.set("state", state);

  return redirect(authorizeUrl.toString(), {
    headers: { "Set-Cookie": await commitSession(session) }
  });
}

export default function GitHubAuth() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
      <h2 className="text-xl font-semibold">Redirecting to GitHub...</h2>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-main-accent border-t-transparent" />
    </div>
  );
}