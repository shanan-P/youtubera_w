import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { Button } from "~/components/Button";
import { createUserSession, getUserId, register as registerUser } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) return redirect("/profile");
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const username = String(form.get("username") || "").trim();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "").trim();
  const rolePref = String(form.get("role") || "learner");

  if (!username || !email || !password) {
    return json({ error: "All fields are required" }, { status: 400 });
  }

  try {
    const user = await registerUser({ username, email, password });
    const redirectTo = rolePref === "youtuber" ? "/dashboard/verify" : "/profile";
    return createUserSession(user.id, redirectTo);
  } catch (e: any) {
    return json({ error: e?.message ?? "Registration failed" }, { status: 400 });
  }
}

export default function Register() {
  const data = useActionData<typeof action>();
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h2 className="text-xl font-semibold">Register</h2>
      {data && (data as any).error && (
        <p className="rounded border border-error-border bg-error-bg p-3 text-sm text-error-text">
          {(data as any).error}
        </p>
      )}
      <Form method="post" className="space-y-3">
        <input
          type="text"
          name="username"
          placeholder="Username"
          className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
          required
        />
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">Account type</span>
          <select
            name="role"
            defaultValue="learner"
            className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
          >
            <option value="learner">Learner (default)</option>
            <option value="youtuber">YouTuber (requires phone verification)</option>
          </select>
        </label>
        <p className="text-xs opacity-70">Choosing YouTuber will take you to phone verification after sign up.</p>
        <Button variant="primary" size="lg" className="w-full">
          Create account
        </Button>
      </Form>
      <div className="space-y-2 pt-2">
        <div className="text-center text-xs uppercase opacity-60">Or continue with</div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="lg" className="flex-1">
            <a href="/auth/github">GitHub</a>
          </Button>
          <Button asChild variant="outline" size="lg" className="flex-1">
            <a href="/auth/google">Google</a>
          </Button>
        </div>
      </div>
      <p className="text-sm opacity-80">
        Already have an account? <Link to="/login" className="text-main-accent hover:underline">Log in</Link>
      </p>
    </div>
  );
}