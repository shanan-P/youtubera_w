import { json } from "@remix-run/node";
import { searchCourses } from "~/services/search.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return json({ courses: [] });
  }

  const courses = await searchCourses(query);
  return json({ courses });
}
