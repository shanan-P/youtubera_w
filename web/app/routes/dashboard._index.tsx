import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { requireUser } from "~/utils/auth.server";
import { Button } from "~/components/Button";

export const meta: MetaFunction = () => ([
  { title: "Dashboard - Youtubera" }
]);

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

export default function DashboardIndex() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {user.profilePicture ? (
          <img src={user.profilePicture} alt="Avatar" className="h-12 w-12 rounded-full object-cover border border-subtle-border" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-subtle-bg" />
        )}
        <div>
          <h2 className="text-xl font-semibold">Welcome, {user.username}</h2>
          <p className="text-sm opacity-70">Role: {user.role}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded border border-subtle-border p-6">
          <h3 className="font-medium">Quick actions</h3>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="secondary">
              <Link to="/profile">Edit profile</Link>
            </Button>
            {!user.isVerified && (
              <Button asChild variant="primary">
                <Link to="/dashboard/verify">Verify as YouTuber</Link>
              </Button>
            )}
          </div>
        </div>
        <div className="rounded border border-subtle-border p-6">
          <h3 className="font-medium">Getting started</h3>
          <p className="mt-2 text-sm opacity-80">Your dashboard will show your courses, progress, and insights here as features are implemented.</p>
        </div>
      </div>
    </div>
  );
}