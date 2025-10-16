import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet } from "@remix-run/react";
import { Button } from "~/components/Button";
import { getUserId, requireUser } from "~/utils/auth.server";

export const meta: MetaFunction = () => ([
  { title: "Dashboard - Youtubera" }
]);

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const isClaimingAnonymous = url.searchParams.get("claim_anonymous") === "true";
  const userId = await getUserId(request);

  // If the user is not logged in AND they are not in the process of claiming an anonymous course,
  // then enforce the login requirement.
  if (!userId && !isClaimingAnonymous) {
    await requireUser(request); // This will throw the redirect.
  }
  const user = await getUserId(request); // We get the user again, which will be null for anonymous claimers.
  return json({ user });
}

export default function DashboardLayout() {
  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="link">
          <Link to="/">&larr; Back to Home</Link>
        </Button>
      </div>
      <Outlet />
    </div>
  );
}