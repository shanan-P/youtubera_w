import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, Link } from "@remix-run/react";
import { Button } from "~/components/Button";
import { requireUser } from "~/utils/auth.server";
import { prisma } from "~/utils/db.server";
import { getCache, setCache, delCache } from "~/utils/redis.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const sent = url.searchParams.get("sent") === "1";
  const verified = url.searchParams.get("verified") === "1";
  const cache = await getCache<{ code: string; phone: string }>(`otp:${user.id}`);
  const sentPhone = cache?.phone || null;
  return json({ user, sent, verified, sentPhone });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "sendOtp") {
    const phone = String(form.get("phone") || "").trim();
    if (!phone) return json({ error: "Phone is required" }, { status: 400 });
    const code = generateOtp();
    await setCache(`otp:${user.id}`, { code, phone }, 600);
    console.log(`[otp] User ${user.username} (${user.id}) phone ${phone} code ${code}`);
    // Admin notification stub: record activity
    try {
      await prisma.learningActivity.create({
        data: { userId: user.id, activityType: "youtuber_verification_requested", points: 0 }
      });
    } catch (e) {
      console.warn("Failed to record admin notification activity", e);
    }
    return redirect("/dashboard/verify?sent=1");
  }

  if (intent === "verifyOtp") {
    const code = String(form.get("code") || "").trim();
    const key = `otp:${user.id}`;
    const data = await getCache<{ code: string; phone: string }>(key);
    if (!data) {
      return json({ error: "OTP expired or not found. Please request a new one." }, { status: 400 });
    }
    if (code !== data.code) {
      return json({ error: "Invalid OTP. Please try again." }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { phone: data.phone, isVerified: true, role: "youtuber" }
    });
    // Admin notification stub: record verification success
    try {
      await prisma.learningActivity.create({
        data: { userId: user.id, activityType: "youtuber_verified", points: 0 }
      });
    } catch (e) {
      console.warn("Failed to record verification success activity", e);
    }
    await delCache(key);
    return redirect("/profile?verified=1");
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

export default function Verify() {
  const { user, sent, sentPhone } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="mb-4">
        <Button asChild variant="link">
          <Link to="/dashboard">&larr; Back to Dashboard</Link>
        </Button>
      </div>
      <h2 className="text-xl font-semibold">Verify as YouTuber</h2>
      {user.isVerified ? (
        <p className="rounded border border-success-border bg-success-bg p-3 text-sm text-success-text">
          Your account is already verified.
        </p>
      ) : (
        <>
          {actionData && (actionData as any).error && (
            <p className="rounded border border-error-border bg-error-bg p-3 text-sm text-error-text">
              {(actionData as any).error}
            </p>
          )}

          {!sent ? (
            <Form method="post" className="space-y-4">
              <input type="hidden" name="_intent" value="sendOtp" />
              <label className="block text-sm">
                <span className="mb-1 block opacity-80">Phone number</span>
                <input
                  type="tel"
                  name="phone"
                  defaultValue={user.phone || ""}
                  placeholder="e.g. +15551234567"
                  className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
                  required
                />
              </label>
              <Button variant="primary" size="lg">
                Send OTP
              </Button>
            </Form>
          ) : (
            <>
              <Form method="post" className="space-y-4">
                <input type="hidden" name="_intent" value="verifyOtp" />
                <label className="block text-sm">
                  <span className="mb-1 block opacity-80">Enter OTP</span>
                  <input
                    type="text"
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="w-full rounded border border-main-border bg-main-bg p-3 text-sm tracking-widest"
                    required
                  />
                </label>
                <Button variant="primary" size="lg">
                  Verify
                </Button>
              </Form>
              <Form method="post" className="mt-2">
                <input type="hidden" name="_intent" value="sendOtp" />
                <input type="hidden" name="phone" value={sentPhone || user.phone || ""} />
                <Button variant="outline" size="lg" type="submit">
                  Resend OTP
                </Button>
              </Form>
            </>
          )}
        </>
      )}
    </div>
  );
}
