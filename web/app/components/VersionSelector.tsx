import React from 'react';

interface VersionSelectorProps {
  course: {
    id: string;
    textContent: string | null;
    formattedVersions?: Array<{ id: string; version: number; content: string; mode: string }>;
  };
  onVersionChange: (version: number) => void;
  selectedVersion: number;
  onVersionDelete?: (versionId: string, versionNumber: number) => void;
  isProcessing?: boolean;
}

export function VersionSelector({ course, onVersionChange, selectedVersion, onVersionDelete, isProcessing = false }: VersionSelectorProps) {
  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newVersion = Number(event.target.value);
    onVersionChange(newVersion);
  };

  const handleDelete = (event: React.MouseEvent, versionId: string, versionNumber: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (onVersionDelete && !isProcessing) {
      onVersionDelete(versionId, versionNumber);
    }
  };

  const getVersionDisplayName = (version: number, mode: string) => {
    const modeNames: Record<string, string> = {
      'original': 'Original',
      'brief': 'Brief',
      'detail': 'Detail',
      'hinglish': 'Hinglish',
      'format': 'Format'
    };

    const modeName = modeNames[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);

    // Find how many versions of this mode exist to determine the number
    const versionsOfSameMode = course.formattedVersions?.filter(v => v.mode === mode) || [];
    const modeIndex = versionsOfSameMode.findIndex(v => v.version === version) + 1;

    return `${modeName} ${modeIndex}`;
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedVersion}
        onChange={handleSelectChange}
        className="rounded bg-gray-100 p-2 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        disabled={isProcessing}
      >
        <option value={0}>Original</option>
        {course.formattedVersions?.map((v) => (
          <option key={v.version} value={v.version}>
            {getVersionDisplayName(v.version, v.mode)}
          </option>
        ))}
      </select>
      {selectedVersion !== 0 && (
        <button
          onClick={(e) => handleDelete(e, course.formattedVersions?.find(v => v.version === selectedVersion)?.id || '', selectedVersion)}
          disabled={isProcessing}
          className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg leading-none"
          title="Delete current version"
        >
          ×
        </button>
      )}
    </div>
  );
}
