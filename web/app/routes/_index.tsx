import { Link } from "@remix-run/react";
import { Button } from "~/components/Button";

export default function Index() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center">
      <h1 className="text-5xl font-bold">Welcome to Youtubera</h1>
      <p className="mt-4 text-lg text-sub-text">
        Your personal YouTube learning assistant.
      </p>
      <div className="mt-8">
        <Button asChild size="lg">
          <Link to="/login">Get Started</Link>
        </Button>
      </div>
    </div>
  );
}
