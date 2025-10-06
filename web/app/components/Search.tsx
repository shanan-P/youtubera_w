import { useFetcher } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";

interface SearchData {
  courses: any[];
}

export function Search() {
  const fetcher = useFetcher<SearchData>();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query) {
      fetcher.load(`/api/search?q=${query}`);
    } else {
      fetcher.submit(null, { method: "get", action: "/api/search" });
    }
  }, [query]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search courses..."
        className="w-full rounded-md border border-gray-300 p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {fetcher.state === "loading" && query && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
          Searching...
        </div>
      )}
      {query && fetcher.data && fetcher.data.courses && fetcher.data.courses.length > 0 && (
        <ul className="absolute z-10 mt-2 w-full rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {fetcher.data.courses.map((course: any) => (
            <li key={course.id} className="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
              <a href={`/dashboard/courses/${course.id}`} className="block p-4 hover:bg-gray-100 dark:hover:bg-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">{course.title}</h3>
                {course.highlight ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2" dangerouslySetInnerHTML={{ __html: course.highlight }}></p>
                ) : course.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{course.description}</p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {query && fetcher.data && fetcher.data.courses && fetcher.data.courses.length === 0 && (
        <div className="absolute z-10 mt-2 w-full rounded-md border border-gray-300 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800 text-gray-500">
          No results found.
        </div>
      )}
    </div>
  );
}