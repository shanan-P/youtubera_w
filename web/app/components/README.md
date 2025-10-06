# Components

This directory holds shared UI components for the Remix app.

- Create small, reusable components in this folder.
- Prefer colocated styles via Tailwind utility classes.
- Keep components server-safe by avoiding direct `window`/`document` access unless clearly client-only.

## Component Overview

- **Button.tsx**: A versatile button component with different variants (`primary`, `secondary`, `ghost`, `outline`, `link`, `destructive`) and sizes (`sm`, `md`, `lg`).
- **Layout.tsx**: The main layout component for the application. It includes the header, footer, and the main content area.
- **NotebookViewer.tsx**: A component for viewing notebook content.
- **Outline.tsx**: A component that displays an outline of the content on the page.
- **Search.tsx**: A component for searching.
- **ThemeContext.tsx**: A context provider for managing the theme of the application.
- **ThemeSwitcher.tsx**: A component for switching the theme of the application.
- **VersionSelector.tsx**: A component for selecting a version of the content.