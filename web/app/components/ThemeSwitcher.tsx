import { useTheme } from './ThemeContext';
import { useState, useRef, useEffect } from 'react';
import { themes } from '~/styles/theme';

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

const BookOpenIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
);

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref]);

  const themeIcons = {
    light: <SunIcon />,
    dark: <MoonIcon />,
    sepia: <BookOpenIcon />,
  };

  const themeLabels = {
    light: 'Light',
    dark: 'Dark',
    sepia: 'Sepia',
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-subtle-bg text-main-text hover:bg-highlight-bg"
      >
        {themeIcons[theme]}
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 w-48 mt-2 overflow-hidden rounded-md shadow-lg bg-paper ring-1 ring-main-border">
          <div className="py-1">
            {Object.keys(themes).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setTheme(key as 'light' | 'dark' | 'sepia');
                  setIsOpen(false);
                }}
                className={`flex items-center w-full px-4 py-2 text-sm text-left ${
                  theme === key ? 'bg-highlight-bg text-main-text' : 'text-sub-text'
                } hover:bg-subtle-bg`}
              >
                <span className="mr-3">{themeIcons[key as 'light' | 'dark' | 'sepia']}</span>
                {themeLabels[key as 'light' | 'dark' | 'sepia']}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}