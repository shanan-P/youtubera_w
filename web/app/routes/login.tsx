import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { Button } from "~/components/Button";
import { createUserSession, getUserId, login } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || "/profile";
  
  // Only redirect if we're not already on the login page
  if (userId && !url.pathname.startsWith("/login")) {
    return redirect(from);
  }
  return json({ from });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const identifier = String(form.get("identifier") || "").trim();
  const password = String(form.get("password") || "").trim();
  const redirectTo = String(form.get("redirectTo") || "/");

  if (!identifier || !password) {
    return json({ error: "Identifier and password are required" }, { status: 400 });
  }

  const user = await login({ identifier, password });
  if (!user) {
    return json({ error: "Invalid credentials" }, { status: 400 });
  }

  return createUserSession(user.id, redirectTo || "/profile");
}

export default function Login() {
  const data = useActionData<typeof action>();
  const { from } = useLoaderData<typeof loader>();
  
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h2 className="text-xl font-semibold">Log in</h2>
      {data && (data as any).error && (
        <p className="rounded border border-error-border bg-error-bg p-3 text-sm text-error-text">
          {(data as any).error}
        </p>
      )}
      <Form method="post" className="space-y-4">
        <input
          type="text"
          name="identifier"
          placeholder="Email or username"
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
        <input type="hidden" name="redirectTo" value={from} />
        <Button variant="primary" size="lg" className="w-full">
          Log in
        </Button>
      </Form>
      <div className="space-y-4 pt-2">
        <div className="text-center text-xs uppercase opacity-60">Or continue with</div>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="lg" className="flex-1">
            <a href="/auth/github">GitHub</a>
          </Button>
          <Button asChild variant="secondary" size="lg" className="flex-1">
            <a href="/auth/google">Google</a>
          </Button>
        </div>
      </div>
      <p className="text-sm opacity-80">
        Don&apos;t have an account? <Button asChild variant="link"><Link to="/register">Register</Link></Button>
      </p>
    </div>
  );
}