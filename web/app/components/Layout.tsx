import { Link, Form, useLoaderData } from "@remix-run/react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { loader } from "~/root";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen w-full bg-main-bg">
      <div className="mx-auto p-4 sm:p-6">
        <header className="mb-8 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold tracking-tight hover:opacity-80">Youtubera</Link>
          <nav className="flex items-center gap-3 text-sm opacity-80">
            {user ? (
              <>
                <Link to="/dashboard/courses" className="hover:underline">Courses</Link>
                <Link to="/dashboard" className="group flex items-center gap-2 hover:underline">
                  {user.profilePicture ? (
                    <img
                      src={user.profilePicture}
                      alt="Avatar"
                      className="h-6 w-6 rounded-full object-cover border border-subtle-border"
                    />
                  ) : (
                    <span className="inline-block h-6 w-6 rounded-full bg-subtle-bg align-middle" />
                  )}
                  <span className="flex items-center gap-1">
                    <span>{user.username}</span>
                    {user.isVerified && (
                      <span title="Verified" className="text-success-text">✔</span>
                    )}
                  </span>
                </Link>
                <Form method="post" action="/logout">
                  <button
                    className="rounded border border-main-border px-3 py-1 text-xs hover:bg-subtle-bg"
                    type="submit"
                  >
                    Logout
                  </button>
                </Form>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:underline">Login</Link>
                <Link to="/register" className="hover:underline">Register</Link>
              </>
            )}
            <ThemeSwitcher />
          </nav>
        </header>
        <main className="bg-main-bg">
          <div className="prose prose-sepia max-w-none dark:prose-invert">
            {children}
          </div>
        </main>
        <footer className="mt-12 text-center text-xs opacity-70">
          &copy; {new Date().getFullYear()} Youtubera
        </footer>
      </div>
    </div>
  );
}
