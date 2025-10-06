import { Link } from "@remix-run/react";
import { useState } from "react";
import { Button } from "./Button";

type OutlineProps = {
  chapters: Array<{ id: string; title: string }>;
  courseId: string;
};

export default function Outline({ chapters, courseId }: OutlineProps) {
    const [isOpen, setIsOpen] = useState(true);

    if (!isOpen) {
        return (
            <Button
                variant="primary"
                size="sm"
                className="fixed top-20 left-4 z-50"
                onClick={() => setIsOpen(true)}
            >
                Outline
            </Button>
        );
    }

  return (
    <div className="fixed top-20 left-4 h-[calc(100vh-6rem)] w-64 overflow-auto rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 z-50">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Outline</h3>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </Button>
      </div>
      <ul>
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Link
              to={`/dashboard/courses/${courseId}#${chapter.id}`}
              className="block truncate py-1 text-blue-600 hover:underline"
            >
              {chapter.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}