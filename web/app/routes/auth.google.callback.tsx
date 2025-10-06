import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { getSession, commitSession } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const session = await getSession(request.headers.get("Cookie") ?? undefined);
  const expectedState = session.get("oauth_state_google");
  const redirectTo = session.get("oauth_redirectTo") ?? "/profile";

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect("/login");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Response("Google OAuth not configured", { status: 500 });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${new URL(request.url).origin}/auth/google/callback`
    })
  });
  if (!tokenRes.ok) return redirect("/login");
  const tokenJson: any = await tokenRes.json();
  const accessToken: string | undefined = tokenJson.access_token;
  if (!accessToken) return redirect("/login");

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!infoRes.ok) return redirect("/login");
  const info: any = await infoRes.json();

  const googleId = String(info.sub);
  const email: string | undefined = info.email;
  const picture: string | undefined = info.picture;
  const name: string | undefined = info.name;

  let user = await prisma.user.findUnique({ where: { googleId } });
  if (!user && email) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId, profilePicture: picture ?? undefined }
      });
    }
  }
  if (!user) {
    const base = (email ? email.split("@")[0] : (name ?? "user"))
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 20) || "user";
    let username = base;
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.user.findUnique({ where: { username } });
      if (!exists) break;
      username = `${base}${Math.floor(Math.random() * 10000)}`;
    }
    user = await prisma.user.create({
      data: {
        username,
        email: email ?? `${googleId}@users.noreply.google.com`,
        googleId,
        profilePicture: picture ?? null,
        isVerified: true
      }
    });
  }

  // Persist login on the SAME session that stored the OAuth state
  session.set("userId", user.id);
  try { session.unset("oauth_state_google"); } catch {}
  try { session.unset("oauth_redirectTo"); } catch {}

  return redirect(redirectTo || "/profile", {
    headers: { "Set-Cookie": await commitSession(session) }
  });
}

export default function GoogleCallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
      <h2 className="text-xl font-semibold">Authenticating with Google...</h2>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-main-accent border-t-transparent" />
    </div>
  );
}