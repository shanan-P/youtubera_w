import type { MetaFunction } from "@remix-run/node";
import { Link, Outlet } from "@remix-run/react";
import { Button } from "~/components/Button";

export const meta: MetaFunction = () => ([{ title: "Courses - Dashboard | Youtubera" }]);

export default function CoursesLayout() {
  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="link">
          <Link to="/dashboard">&larr; Back to Dashboard</Link>
        </Button>
      </div>
      <Outlet />
    </div>
  );
}