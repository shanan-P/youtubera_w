import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked, type MarkedOptions } from 'marked';
import hljs from 'highlight.js';
import type { HighlightResult } from 'highlight.js';
import { Button } from './Button';
import { useTheme } from './ThemeContext';

interface NotebookViewerProps {
  content: string;
  courseId?: string;
  title?: string;
}

type Heading = { id: string; text: string; level: number };
type OutlineHeading = { id: string; text: string; level: number; page: number };

function slugifyBase(s: string) {
  return s
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function makeSlugger() {
  const counts: Record<string, number> = {};
  return (s: string) => {
    const base = slugifyBase(s);
    const n = counts[base] || 0;
    counts[base] = n + 1;
    return n ? `${base}-${n}` : base;
  };
}

// Simple fast hash to fingerprint current content; avoids stale progress from previous versions
function computeHash(s: string): string {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

export function NotebookViewer({ 
  content, 
  courseId, 
  title 
}: NotebookViewerProps) {
  const { theme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string>("");
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [readingMode, setReadingMode] = useState<boolean>(true);
  const [fontScale, setFontScale] = useState<number>(1);
  const [progress, setProgress] = useState<number>(0);
  const [readingSec, setReadingSec] = useState<number>(0);
  const [tocOpen, setTocOpen] = useState<boolean>(false);
  const storageKey = useMemo(() => (courseId ? `reader:${courseId}` : undefined), [courseId]);
  const [pagesHtml, setPagesHtml] = useState<string[]>([]);
  const [pagesHeadings, setPagesHeadings] = useState<Heading[][]>([]);
  const [currentPage, setCurrentPage] = useState<number>(() => {
    // Initialize from localStorage if available
    if (typeof window === 'undefined') return 1;
    try {
      const saved = storageKey ? localStorage.getItem(storageKey) : null;
      if (saved) {
        const data = JSON.parse(saved) as { page?: number };
        return data.page && data.page > 0 ? data.page : 1;
      }
    } catch (e) {
      console.error('Failed to restore page from localStorage', e);
    }
    return 1;
  });
  const [totalPages, setTotalPages] = useState<number>(1);
  const restoreScrollPctRef = useRef<number | null>(null);
  const pendingScrollToIdRef = useRef<string | null>(null);
  const [outlineHeadings, setOutlineHeadings] = useState<OutlineHeading[]>([]);
  const [savedProgress, setSavedProgress] = useState<number>(0);
  const [bookMode, setBookMode] = useState<boolean>(false);
  // Suppress first 0% save after page switch (unless restoring)
  const suppressFirstSaveAfterPageChangeRef = useRef<boolean>(false);

  // Estimated read time (words/min ~200) from the full markdown content
  const estReadMin = useMemo(() => {
    const md = content || '';
    const text = md
      .replace(/```[\s\S]*?```/g, ' ') // remove code blocks
      .replace(/![[[\]]*\([^)]*\)/g, ' ') // images
      .replace(/[[[\]]*\([^)]*\)/g, ' ') // links
      .replace(/<[^>]*>/g, ' '); // html
    const words = (text.match(/\b\w+\b/g) || []).length;
    return Math.max(1, Math.ceil(words / 200));
  }, [content]);
  const [showTop, setShowTop] = useState<boolean>(false);

  // Build pages from markdown using <!-- PAGEBREAK:n --> markers (backend)
  // If no markers exist, fall back to a single page.
  useEffect(() => {
    const processMarkdown = async (): Promise<void> => {
      if (!content) return;
      let md = content || '';
      // If content does not start with a PAGEBREAK, prepend PAGEBREAK:1 so title and intro belong to page 1
      if (!/^\s*<!--\s*PAGEBREAK:\s*\d+\s*-->/i.test(md)) {
        md = `<!-- PAGEBREAK:1 -->\n${md}`;
      }
      // Split on PAGEBREAK markers, capturing the page number
      const parts = md.split(/<!--\s*PAGEBREAK:\s*(\d+)\s*-->/gi);
      // parts structure: [pre, num1, seg1, num2, seg2, ...]; we ignore the initial pre (should be before first marker)
      const pageMarkdownsRaw: string[] = [];
      for (let i = 1; i < parts.length; i += 2) {
        const seg = (parts[i + 1] || '').trim();
        if (seg) {
          pageMarkdownsRaw.push(seg);
        }
      }
      if (pageMarkdownsRaw.length === 0) {
        pageMarkdownsRaw.push(md.replace(/<!--\s*PAGEBREAK:\s*\d+\s*-->/gi, '').trim());
      }
      // Remove any legacy visible page labels like '#### Page n'
      const pageMarkdowns = pageMarkdownsRaw.map((seg) => seg.trim());
      const newPagesHtml: string[] = [];
      const newPagesHeadings: Heading[][] = [];

      pageMarkdowns.forEach((seg, idx) => {
        // Build outline for this page
        const outlineSlug = makeSlugger();
        // Use the segment as-is (we already stripped PAGEBREAKs and labels)
        const segNorm = seg;
        const toks = marked.lexer(segNorm);
        const heads: Heading[] = [];
        toks.forEach((token) => {
          if (token.type === 'heading' && 'depth' in token && 'text' in token) {
            const headingToken = token as { depth: number; text: string };
            if (typeof headingToken.depth === 'number' && headingToken.depth <= 3) {
              const id = outlineSlug(headingToken.text || '');
              heads.push({ 
                id, 
                text: headingToken.text || '', 
                level: headingToken.depth 
              });
            }
          }
        });
        newPagesHeadings.push(heads);

        // Render HTML for this page with per-parse slugger
        const renderSlug = makeSlugger();
        const renderer = new marked.Renderer();
        
        // Configure marked with custom renderer and highlight function
        const markedOptions: MarkedOptions = {
          renderer,
          highlight: function(code: string, lang?: string): string {
            const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
            try {
              return hljs.highlight(code, { language }).value;
            } catch (err) {
              console.error('Error highlighting code:', err);
              return code;
            }
          },
          langPrefix: theme === 'dark' ? 'hljs language-atom-one-dark' : 'hljs language-'
        } as MarkedOptions; // Type assertion to handle custom highlight function
        
        // Parse markdown
        const parseMarkdown = (markdown: string): string => {
          try {
            const result = marked.parse(markdown, markedOptions);
            if (result instanceof Promise) {
              console.warn('marked.parse returned a Promise, but we expected a string');
              return markdown;
            }
            return result as string;
          } catch (error) {
            console.error('Error parsing markdown:', error);
            return markdown;
          }
        };
        
        try {
          const html = parseMarkdown(segNorm);
          newPagesHtml.push(html);
        } catch (error) {
          console.error('Error processing markdown segment:', error);
          newPagesHtml.push(segNorm); // Fallback to original content
        }
      });

      setPagesHtml(newPagesHtml);
      setPagesHeadings(newPagesHeadings);
      setTotalPages(newPagesHtml.length);
      const allHeadings: OutlineHeading[] = [];
      newPagesHeadings.forEach((heads, pageIdx) => {
        heads.forEach((h) => {
          allHeadings.push({ ...h, page: pageIdx + 1 });
        });
      });
      setOutlineHeadings(allHeadings);

      // Restore scroll position after page content is rendered
      if (restoreScrollPctRef.current !== null && rootRef.current) {
        rootRef.current.scrollTop = rootRef.current.scrollHeight * restoreScrollPctRef.current;
        restoreScrollPctRef.current = null;
      }
      // Scroll to heading if pending
      if (pendingScrollToIdRef.current) {
        // Use timeout to allow DOM to update
        setTimeout(() => {
          const el = document.getElementById(pendingScrollToIdRef.current!);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
          pendingScrollToIdRef.current = null;
        }, 100);
      }
    };

    processMarkdown().catch(console.error);
  }, [content, theme]);

  // Handle page change
  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    // Restore scroll position if available
    if (restoreScrollPctRef.current !== null && rootRef.current) {
      rootRef.current.scrollTop = rootRef.current.scrollHeight * restoreScrollPctRef.current;
      restoreScrollPctRef.current = null;
    }
    
    // Scroll to heading if pending
    if (pendingScrollToIdRef.current) {
      // Use timeout to allow DOM to update
      setTimeout(() => {
        const pendingId = pendingScrollToIdRef.current;
        if (pendingId) {
          const el = document.getElementById(pendingId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
          pendingScrollToIdRef.current = null;
        }
      }, 100);
    }
  }, [currentPage]);

  // Scroll handling
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    let scrollTimeout: any;

    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const { scrollTop, scrollHeight, clientHeight } = root;
        if (scrollHeight <= clientHeight) {
          setProgress(100);
          return;
        }
        const pct = (scrollTop / (scrollHeight - clientHeight)) * 100;
        setProgress(pct);

        // Update active heading
        let bestId = '';
        let bestY = -Infinity;
        for (const h of headings) {
          const el = document.getElementById(h.id);
          if (el) {
            const y = el.getBoundingClientRect().top;
            if (y < 100 && y > bestY) {
              bestY = y;
              bestId = h.id;
            }
          }
        }
        setActiveId(bestId);
      }, 100);
    };

    root.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [headings]);

  // Save/restore state
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    const hash = computeHash(content);

    // Restore
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        interface SavedState {
          hash?: string;
          fontScale?: number;
          focusMode?: boolean;
          readingMode?: boolean;
          readingSec?: number;
          progress?: number;
          page?: number;
        }
        
        const data: SavedState = JSON.parse(saved);
        
        if (data.hash === hash) {
          if (typeof data.fontScale === 'number') setFontScale(data.fontScale);
          if (typeof data.focusMode === 'boolean') setFocusMode(data.focusMode);
          if (typeof data.readingMode === 'boolean') setReadingMode(data.readingMode);
          if (typeof data.readingSec === 'number') setReadingSec(data.readingSec);
          if (typeof data.progress === 'number') setSavedProgress(data.progress);
          
          if (typeof data.page === 'number' && data.page > 0) {
            suppressFirstSaveAfterPageChangeRef.current = true;
            setCurrentPage(data.page);
          }
          
          if (typeof data.progress === 'number' && data.progress > 1) {
            restoreScrollPctRef.current = data.progress / 100;
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore reading state', e);
    }

    // Save progress interval
    const saveInterval = setInterval(() => {
      setReadingSec((s) => s + 1);
    }, 1000);

    return () => clearInterval(saveInterval);
  }, [storageKey, content]);

  // Persist state to local storage
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }
    if (suppressFirstSaveAfterPageChangeRef.current) {
      suppressFirstSaveAfterPageChangeRef.current = false;
      return;
    }

    const hash = computeHash(content);
    const data = {
      progress,
      fontScale,
      focusMode,
      readingMode,
      readingSec,
      hash,
      page: currentPage,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save reading state', e);
    }
  }, [progress, fontScale, focusMode, readingMode, readingSec, storageKey, currentPage, content]);

  const handleTocClick = (id: string, page: number) => {
    if (page !== currentPage) {
      pendingScrollToIdRef.current = id;
      setCurrentPage(page);
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
    setTocOpen(false);
  };

  const pageContent = useMemo(() => {
    return pagesHtml[currentPage - 1] || '';
  }, [pagesHtml, currentPage]);

  useEffect(() => {
    setHeadings(pagesHeadings[currentPage - 1] || []);
  }, [pagesHeadings, currentPage]);

  return (
    <div className="relative">
      {/* Top progress indicator */}
      <div className="fixed left-0 right-0 top-0 z-30 h-1">
        <div
          className="h-full bg-main-accent transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Subtle backdrop gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-main-accent/10 to-transparent dark:from-main-accent/10"
      />

    <div className={`relative z-10 mx-auto ${readingMode ? 'max-w-full' : 'max-w-7xl p-4 sm:p-6 lg:p-8'}`}>
      <div className="flex flex-col lg:flex-row">
        {/* Sidebar */}
        {tocOpen && outlineHeadings.length > 0 ? (
          <nav className="lg:w-64 lg:flex-shrink-0">
            <div className="sticky top-4 overflow-y-auto overflow-x-hidden rounded-lg border border-subtle-border bg-paper p-4">
              <h2 className="mb-3 text-sm font-medium text-primary">Table of Contents</h2>
              <ul className="space-y-2 text-sm">
                {outlineHeadings.map((h) => (
                  <li key={h.id} style={{ marginLeft: `${(h.level - 2) * 1}rem` }}>
                    <a
                      href={`#${h.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleTocClick(h.id, h.page);
                      }}
                      className={`block truncate hover:underline ${h.page === currentPage && activeId === h.id ? 'text-main-accent' : 'text-sub-text'}`}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        ) : (
          <div className="hidden lg:block" />
        )}

        {/* Reader Column */}
        <div className={`flex-1 min-w-0 space-y-3 bg-paper sepia:bg-sepia sepia:text-sepia-text ${readingMode ? '' : 'lg:pl-8'}`}>
          {/* Toolbar */}
          <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 rounded border border-subtle-border bg-paper p-2 text-xs sepia:border-sepia-border sepia:bg-sepia">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFocusMode((v) => !v)}
                title="Toggle focus mode"
              >
                {focusMode ? 'Exit Focus' : 'Focus Mode'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTocOpen((v) => !v)}
                title="Toggle table of contents"
              >
                {tocOpen ? 'Hide Contents' : 'Show Contents'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                    const newBookMode = !bookMode;
                    setBookMode(newBookMode);
                    if (newBookMode && currentPage % 2 === 0) {
                        setCurrentPage(p => p - 1);
                    }
                }}
                title="Toggle book mode"
              >
                {bookMode ? 'Single Page' : 'Book Mode'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFontScale((s) => Math.max(0.8, +(s - 0.05).toFixed(2)))}
                title="Decrease font size"
              >
                A-
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFontScale(1)}
                title="Reset font size"
              >
                A
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFontScale((s) => Math.min(1.5, +(s + 0.05).toFixed(2)))}
                title="Increase font size"
              >
                A+
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - (bookMode ? 2 : 1)))}
                disabled={currentPage <= 1}
                title="Previous page"
              >
                ◀ Prev
              </Button>
              <div className="p-2 flex items-center gap-1">
                <span>Page</span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value, 10);
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  onBlur={(e) => { // handle case where user leaves input empty
                    if (!e.target.value) {
                      setCurrentPage(1);
                    }
                  }}
                  className="w-full max-w-xs text-center rounded border border-subtle-border bg-paper"
                />
                <span>/ {totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + (bookMode ? 2 : 1)))}
                disabled={bookMode ? currentPage + 1 >= totalPages : currentPage >= totalPages}
                title="Next page"
              >
                Next ▶
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Mobile TOC toggle */}
              {outlineHeadings.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTocOpen((v) => !v)}
                  className="lg:hidden"
                  title="Toggle outline"
                >
                  {tocOpen ? 'Hide Outline' : 'Show Outline'}
                </Button>
              )}
              {storageKey && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    // A bit of a hack to find the furthest page
                    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
                    const progress = saved.progress || 0;
                    const page = Math.floor(progress * totalPages / 100) + 1;
                    setCurrentPage(page);
                    restoreScrollPctRef.current = (progress / 100) % (1/totalPages);
                  }}
                  title="Continue from last position"
                >
                  Continue {Math.round(savedProgress)}%
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div
            ref={rootRef}
            className={`overflow-x-auto rounded-lg border border-subtle-border sepia:border-sepia-border bg-transparent sepia:bg-sepia ${bookMode ? 'p-4 sm:p-6' : 'p-6'}`}
            style={{ '--font-scale': fontScale } as React.CSSProperties}>
            {bookMode ? (
              <div className="hidden lg:flex justify-center gap-8">
                {/* Left Page */}
                <div
                  className={`prose break-words w-full bg-paper sepia:bg-sepia p-8 shadow-lg ring-1 ring-subtle-border sepia:ring-sepia-border rounded ${focusMode ? 'max-w-none' : 'max-w-none'} dark:prose-invert sepia:prose-sepia ${readingMode ? 'prose-reading' : ''}`}
                  dangerouslySetInnerHTML={{ __html: pagesHtml[currentPage - 1] || '' }}
                />
                {/* Right Page */}
                <div
                  className={`prose break-words w-full bg-paper sepia:bg-sepia p-8 shadow-lg ring-1 ring-subtle-border sepia:ring-sepia-border rounded ${focusMode ? 'max-w-none' : 'max-w-none'} dark:prose-invert sepia:prose-sepia ${readingMode ? 'prose-reading' : ''} ${currentPage + 1 > totalPages ? 'opacity-0 pointer-events-none' : ''}`}
                  dangerouslySetInnerHTML={{ __html: pagesHtml[currentPage] || '' }}
                />
              </div>
            ) : (
              <div
                className={`prose break-words ${focusMode ? 'max-w-3xl mx-auto' : 'max-w-none'} dark:prose-invert sepia:prose-sepia ${readingMode ? 'prose-reading' : ''}`}
                dangerouslySetInnerHTML={{ __html: pageContent }}
              />
            )}
            {(bookMode) && (
                <div
                    className={`block lg:hidden prose break-words ${focusMode ? 'max-w-3xl mx-auto' : 'max-w-none'} dark:prose-invert sepia:prose-sepia ${readingMode ? 'prose-reading' : ''}`}
                    dangerouslySetInnerHTML={{ __html: pageContent }}
                />
            )}
          </div>
        </div>
      </div>

      {showTop && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-20 right-6 z-40 rounded-full !px-3 !py-2 text-white shadow-lg lg:bottom-6"
          title="Back to top"
        >
          ↑ Top
        </Button>
      )}
    </div>
  </div>
  );
}