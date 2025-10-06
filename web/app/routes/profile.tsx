import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useFetcher, useRevalidator, Link } from "@remix-run/react";
import { Button } from "~/components/Button";
import { useEffect, useState } from "react";
import { prisma } from "~/utils/db.server";
import { requireUser, hashPassword, verifyPassword } from "~/utils/auth.server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Predefined default avatar options (no upload required)
const DEFAULT_AVATARS = [
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Ada",
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Linus",
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Grace",
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Alan",
  "https://api.dicebear.com/7.x/identicon/svg?seed=Phoenix",
  "https://api.dicebear.com/7.x/identicon/svg?seed=Nova",
  "https://api.dicebear.com/7.x/thumbs/svg?seed=Pixel",
  "https://api.dicebear.com/7.x/pixel-art/svg?seed=Sage"
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const updated = url.searchParams.get("updated") === "1";
  const verified = url.searchParams.get("verified") === "1";
  const pwChanged = url.searchParams.get("pw") === "1";
  return json({ user, updated, verified, pwChanged });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "updateProfile");

  if (intent === "setDefaultAvatar") {
    const selectedAvatar = String(form.get("selectedAvatar") || "").trim();
    if (!selectedAvatar || !DEFAULT_AVATARS.includes(selectedAvatar)) {
      return json({ ok: false, error: "Invalid avatar selection" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { profilePicture: selectedAvatar } });
    return json({ ok: true });
  }

  if (intent === "changePassword") {
    try {
      const currentPassword = String(form.get("currentPassword") || "");
      const newPassword = String(form.get("newPassword") || "").trim();
      const confirmPassword = String(form.get("confirmPassword") || "").trim();

      if (!newPassword || newPassword.length < 8) {
        return json({ error: "New password must be at least 8 characters" }, { status: 400 });
      }
      if (newPassword !== confirmPassword) {
        return json({ error: "New password and confirmation do not match" }, { status: 400 });
      }

      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
      if (dbUser?.passwordHash) {
        if (!currentPassword) return json({ error: "Current password is required" }, { status: 400 });
        const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
        if (!ok) return json({ error: "Current password is incorrect" }, { status: 400 });
      }

      const newHash = await hashPassword(newPassword);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      return redirect("/profile?pw=1");
    } catch (e: any) {
      return json({ error: e?.message || "Failed to change password" }, { status: 400 });
    }
  }

  // Default: update profile details
  const username = String(form.get("username") || "").trim();
  const email = String(form.get("email") || "").trim();
  const bio = String(form.get("bio") || "").trim();
  const avatar = form.get("avatar");
  const selectedAvatar = String(form.get("selectedAvatar") || "").trim();

  if (!username || !email) {
    return json({ error: "Username and email are required" }, { status: 400 });
  }

  let profilePicturePath: string | undefined;
  try {
    if (avatar instanceof File && avatar.size > 0) {
      const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
      if (!allowed.includes(avatar.type)) {
        return json({ error: "Avatar must be PNG, JPG, WebP, or GIF" }, { status: 400 });
      }
      const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
      await mkdir(uploadDir, { recursive: true });
      const orig = avatar.name || "avatar";
      const extFromName = path.extname(orig) ||
        (avatar.type === "image/png" ? ".png" : avatar.type === "image/jpeg" ? ".jpg" : avatar.type === "image/webp" ? ".webp" : avatar.type === "image/gif" ? ".gif" : "");
      const filename = `${user.id}-${Date.now()}${extFromName}`;
      const filePath = path.join(uploadDir, filename);
      const buf = Buffer.from(await avatar.arrayBuffer());
      await writeFile(filePath, buf);
      profilePicturePath = `/uploads/avatars/${filename}`;
    }

    // If no upload, but a default avatar was selected, accept from allowlist
    if (!profilePicturePath && selectedAvatar && DEFAULT_AVATARS.includes(selectedAvatar)) {
      profilePicturePath = selectedAvatar;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { username, email, bio, ...(profilePicturePath ? { profilePicture: profilePicturePath } : {}) }
    });

    return redirect("/profile?updated=1");
  } catch (e: any) {
    const message = e?.code === "P2002" ? "Username or email already in use" : e?.message || "Failed to update profile";
    return json({ error: message }, { status: 400 });
  }
}

export default function Profile() {
  const { user, updated, verified, pwChanged } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(user.profilePicture ?? null);
  const [selectedDefault, setSelectedDefault] = useState<string | null>(
    DEFAULT_AVATARS.includes(user.profilePicture ?? "") ? user.profilePicture! : null
  );
  const avatarFetcher = useFetcher();
  const revalidator = useRevalidator();

  useEffect(() => {
    if ((avatarFetcher.data as any)?.ok) {
      // Revalidate loaders to update header/nav avatar without full page reload
      revalidator.revalidate();
    }
  }, [avatarFetcher.data, revalidator]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="mb-4">
        <Button asChild variant="link">
          <Link to="/dashboard">&larr; Go to Dashboard</Link>
        </Button>
      </div>
      <h2 className="text-xl font-semibold">Your Profile</h2>
      {actionData && (actionData as any).error && (
        <p className="rounded border border-error-border bg-error-bg p-3 text-sm text-error-text">
          {(actionData as any).error}
        </p>
      )}
      {((actionData as any)?.success || updated) && (
        <p className="rounded border border-success-border bg-success-bg p-3 text-sm text-success-text">
          Profile updated
        </p>
      )}
      {verified && (
        <p className="rounded border border-success-border bg-success-bg p-3 text-sm text-success-text">
          Verification successful! Your account is now verified as a YouTuber.
        </p>
      )}
      {pwChanged && (
        <p className="rounded border border-success-border bg-success-bg p-3 text-sm text-success-text">
          Password updated successfully.
        </p>
      )}
      <Form method="post" encType="multipart/form-data" className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">Username</span>
          <input
            type="text"
            name="username"
            defaultValue={user.username}
            className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">Email</span>
          <input
            type="email"
            name="email"
            defaultValue={user.email}
            className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
            required
          />
        </label>
        <div className="flex items-center gap-4">
          {previewAvatar || user.profilePicture ? (
            <img src={previewAvatar || user.profilePicture!} alt="Avatar" className="h-12 w-12 rounded-full object-cover border border-subtle-border" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-highlight-bg" />
          )}
          <label className="block text-sm flex-1">
            <span className="mb-1 block opacity-80">Avatar</span>
            <input
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-subtle-bg file:p-3"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) {
                  const url = URL.createObjectURL(f);
                  setPreviewAvatar(url);
                  setSelectedDefault(null);
                }
              }}
            />
          </label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm opacity-80">Or choose a default avatar</legend>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {DEFAULT_AVATARS.map((url) => {
              const isSelected = selectedDefault === url;
              return (
                <label key={url} className={`group relative inline-flex items-center justify-center rounded-full border p-1 cursor-pointer transition ${isSelected ? "border-main-accent ring-2 ring-subtle-accent" : "border-main-border"}`}>
                  <input
                    type="radio"
                    name="selectedAvatar"
                    value={url}
                    checked={isSelected}
                    onChange={() => {
                      setSelectedDefault(url);
                      setPreviewAvatar(url);
                      const fd = new FormData();
                      fd.set("intent", "setDefaultAvatar");
                      fd.set("selectedAvatar", url);
                      avatarFetcher.submit(fd, { method: "post" });
                    }}
                    className="peer absolute opacity-0"
                  />
                  <img src={url} alt="Default avatar" className="h-10 w-10 rounded-full object-cover" />
                </label>
              );
            })}
          </div>
          <p className="text-xs opacity-70">Selecting a default avatar will override any previously set avatar unless you upload a new image above.</p>
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">Bio</span>
          <textarea
            name="bio"
            defaultValue={user.bio || ""}
            rows={4}
            className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
          />
        </label>
        <Button variant="primary" size="lg">
          Save changes
        </Button>
      </Form>
      <div className="mt-8 rounded border border-subtle-border p-6">
        <h3 className="mb-3 font-medium">Change password</h3>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="changePassword" />
          <label className="block text-sm">
            <span className="mb-1 block opacity-80">Current password</span>
            <input
              type="password"
              name="currentPassword"
              placeholder="Current password"
              className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block opacity-80">New password</span>
            <input
              type="password"
              name="newPassword"
              placeholder="New password (min 8 characters)"
              className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
              required
              minLength={8}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block opacity-80">Confirm new password</span>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm new password"
              className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
              required
              minLength={8}
            />
          </label>
          <p className="text-xs opacity-70">If you signed in with Google/GitHub and don't have a password yet, leave Current password blank.</p>
          <Button variant="primary" size="lg">
            Update password
          </Button>
        </Form>
      </div>
    </div>
  );
}
