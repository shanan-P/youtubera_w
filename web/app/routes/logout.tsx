import type { ActionFunctionArgs } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { Button } from "~/components/Button";
import { logout } from "~/utils/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  return logout(request);
}

export default function Logout() {
  return (
    <div className="mx-auto max-w-sm space-y-4 text-center">
      <h2 className="text-xl font-semibold">You have been logged out</h2>
      <p>
        <Button asChild variant="primary">
          <Link to="/">Go to Home</Link>
        </Button>
      </p>
    </div>
  );
}