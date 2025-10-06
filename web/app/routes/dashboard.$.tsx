import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { Button } from "~/components/Button";
import { requireUser } from "~/utils/auth.server";

export const meta: MetaFunction = () => ([{ title: "Not Found - Dashboard | Youtubera" }]);

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const rest = params["*"] || "";
  return json({ error: `The page /dashboard/${rest} does not exist.` }, { status: 404 });
}

export default function DashboardCatchAll() {
  const data = useLoaderData<typeof loader>();
  return (
    <div className="rounded border border-error-border bg-error-bg p-6 text-center text-error-text">
      <h2 className="text-xl font-semibold">Page Not Found</h2>
      <p className="mt-2">{data.error}</p>
      <div className="mt-6">
        <Button asChild variant="secondary">
          <Link to="/dashboard">Go back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}