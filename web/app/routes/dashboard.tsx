import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet } from "@remix-run/react";
import { Button } from "~/components/Button";
import { requireUser } from "~/utils/auth.server";

export const meta: MetaFunction = () => ([
  { title: "Dashboard - Youtubera" }
]);

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
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