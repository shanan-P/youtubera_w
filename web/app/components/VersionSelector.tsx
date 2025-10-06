import React from 'react';

interface VersionSelectorProps {
  course: {
    id: string;
    textContent: string | null;
    formattedVersions?: Array<{ version: number; content: string }>;
  };
  onVersionChange: (version: number) => void;
  selectedVersion: number;
}

export function VersionSelector({ course, onVersionChange, selectedVersion }: VersionSelectorProps) {
  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newVersion = Number(event.target.value);
    onVersionChange(newVersion);
  };

  return (
    <select
      value={selectedVersion}
      onChange={handleSelectChange}
      className="rounded bg-gray-100 p-2 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
    >
      <option value={0}>Original</option>
      {course.formattedVersions?.map((v) => (
        <option key={v.version} value={v.version}>
          Version {v.version}
        </option>
      ))}
    </select>
  );
}
