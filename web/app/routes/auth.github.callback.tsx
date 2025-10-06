import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { getSession, commitSession } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const session = await getSession(request.headers.get("Cookie") ?? undefined);
  const expectedState = session.get("oauth_state_github");
  const redirectTo = session.get("oauth_redirectTo") ?? "/profile";

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect("/login?oauth_error=state");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Response("GitHub OAuth not configured", { status: 500 });
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${new URL(request.url).origin}/auth/github/callback`,
      state
    })
  });
  if (!tokenRes.ok) {
    try {
      const errJson = await tokenRes.json();
      console.error("[oauth:github] token exchange failed", errJson);
    } catch (e) {
      console.error("[oauth:github] token exchange failed (no json)", tokenRes.status, tokenRes.statusText);
    }
    return redirect("/login?oauth_error=token");
  }
  const tokenJson: any = await tokenRes.json();
  const accessToken: string | undefined = tokenJson.access_token;
  if (!accessToken) {
    console.error("[oauth:github] no access_token in response", tokenJson);
    return redirect("/login?oauth_error=no_token");
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Youtubera/1.0.0",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!userRes.ok) return redirect("/login?oauth_error=user_fetch");
  const ghUser: any = await userRes.json();

  let email: string | null = null;
  try {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Youtubera/1.0.0",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified) ?? emails[0];
      email = primary?.email ?? null;
    }
  } catch {}

  const githubId = String(ghUser.id);
  let user = await prisma.user.findUnique({ where: { githubId } });
  if (!user && email) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { githubId, profilePicture: ghUser.avatar_url ?? undefined }
      });
    }
  }
  // If user exists already by githubId, ensure avatar is up to date at least
  if (user && ghUser?.avatar_url && user.profilePicture !== ghUser.avatar_url) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { profilePicture: ghUser.avatar_url }
    });
  }
  if (!user) {
    const baseUsername = (ghUser.login ?? (email ? email.split("@")[0] : "user"))
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 20) || "user";
    let username = baseUsername;
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.user.findUnique({ where: { username } });
      if (!exists) break;
      username = `${baseUsername}${Math.floor(Math.random() * 10000)}`;
    }
    user = await prisma.user.create({
      data: {
        username,
        email: email ?? `${githubId}@users.noreply.github.com`,
        githubId,
        profilePicture: ghUser.avatar_url ?? null,
        isVerified: true
      }
    });
  }

  // Persist login on the SAME session cookie to avoid losing state/cookie domain
  session.set("userId", user.id);
  session.unset("oauth_state_github");
  session.unset("oauth_redirectTo");
  return redirect(redirectTo || "/profile", {
    headers: { "Set-Cookie": await commitSession(session) }
  });
}

export default function GitHubCallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
      <h2 className="text-xl font-semibold">Authenticating with GitHub...</h2>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-main-accent border-t-transparent" />
    </div>
  );
}