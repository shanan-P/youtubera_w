import { useEffect, useMemo, useState, useRef } from "react";
import { Form, Link, Outlet, useActionData, useLoaderData, useNavigation, useParams, useSearchParams } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from "~/utils/auth.server";
import { prisma } from "~/utils/db.server";
import { formatWithGemini } from '~/services/gemini.server';
import * as path from 'path';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Highlight, themes } from 'prism-react-renderer';
import { useTheme } from '~/components/ThemeContext';
import { Button } from '~/components/Button';

// Import components
import { VersionSelector } from '~/components/VersionSelector';
import { NotebookViewer } from "~/components/NotebookViewer";
import { ThemeSwitcher } from '~/components/ThemeSwitcher';

// Import services and types
import { getCourseById, updateCourse } from "~/services/course.server";
import { generateShortForEntry } from '~/services/shorts.server';
import type { ProcessingType } from "@prisma/client";
import { extractTextFromPdfWithAdobe } from "~/services/adobe-extract.server";
import { createPdfFromHtml } from '~/utils/pdf-utils';

// Define a custom Course type that includes our custom fields
interface Course {
  id: string;
  title: string;
  description: string | null;
  contentType: string;
  sourceUrl: string | null;
  filePath: string | null;
  textContent: string | null;
  youtuberName: string | null;
  channelName: string | null;
  authorName: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  userId: string;
  chapters: Array<{ 
    id: string;
    title: string;
    shortVideos: Array<{ 
      id: string;
      title: string;
      startTime: number | null;
      endTime: number | null;
      duration: number | null;
      videoUrl: string;
      downloadUrl: string | null;
      thumbnailUrl: string | null;
      processingType: ProcessingType | null;
      customQuery: string | null;
      relevanceScore: number | null;
      orderIndex: number | null;
      createdAt: Date | string;
    }>;
  }>;
  formattedVersions: Array<{ 
    id: string;
    courseId: string;
    content: string;
    version: number;
    createdAt: Date | string;
  }>;
};

interface CourseWithExtras extends Omit<Course, 'chapters' | 'createdAt' | 'updatedAt'> {
  filePath: string | null;
  textContent: string | null;
  chapters: Array<{ 
    id: string;
    title: string;
    shortVideos: Array<{ 
      id: string;
      title: string;
      startTime: number | null;
      endTime: number | null;
      duration: number | null;
      videoUrl: string;
      downloadUrl: string | null;
      thumbnailUrl: string | null;
      processingType: ProcessingType | null;
      customQuery: string | null;
      relevanceScore: number | null;
      orderIndex: number | null;
      createdAt: Date | string;
    }>;
  }>;
};

interface ActionData {
  error?: string;
  details?: string;
  extractedText?: string;
  filename?: string;
  formattedMarkdown?: string;
  warning?: string;
  success?: boolean;
  message?: string;
};

interface CodeComponentProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;  
  [key: string]: any;
}

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: number;
  node?: any;
}

interface ParagraphProps extends React.HTMLAttributes<HTMLParagraphElement> {
  node?: any;
}

interface ListProps extends React.OlHTMLAttributes<HTMLOListElement> {
  ordered?: boolean;
  node?: any;
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  node?: any;
}

interface BlockquoteProps extends React.BlockquoteHTMLAttributes<HTMLQuoteElement> {
  node?: any;
  children?: React.ReactNode;
}

// Markdown components configuration
const components: Components = {
          code({ node, inline, className, children, ...props }: CodeComponentProps) {
            const match = /language-(\w+)/.exec(className || '');
            const content = children || ''; // Handle undefined children
            return !inline && match ? (
              <div className="bg-subtle-bg rounded-md p-4 text-sm my-4">
                <Highlight
                  theme={themes.vsDark}
                  code={String(children).replace(/\n$/, '')}
                  language={match[1]}> 
                  {( { className, style, tokens, getLineProps, getTokenProps }) => (
                    <pre className={className} style={style}> 
                      {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line }) }>
                          {line.map((token, key) => (
                            <span key={key} {...getTokenProps({ token })} />
                          ))}
                        </div>
                      ))}
                    </pre>
                  )}
                </Highlight>
              </div>
            ) : (
              <code className={className} {...props}>
                {content}
              </code>
            );
          },
          pre: (props: React.HTMLAttributes<HTMLPreElement>) => {
            const { children, className = '', ...safeProps } = props;
            return (
              <div 
                className={`mb-4 ${className}`}
                {...safeProps as React.HTMLAttributes<HTMLDivElement>}
              >
                {children}
              </div>
            );
          },
          h1: (props: HeadingProps) => <h1 id={slugify(props.children?.toString() || "")} className="text-2xl font-bold mt-6 mb-4" {...props} />,
          h2: (props: HeadingProps) => <h2 id={slugify(props.children?.toString() || "")} className="text-xl font-semibold mt-5 mb-3" {...props} />,
          h3: (props: HeadingProps) => <h3 id={slugify(props.children?.toString() || "")} className="text-lg font-medium mt-4 mb-2" {...props} />,
          p: (props: ParagraphProps) => <p className="mb-4 leading-relaxed" {...props} />,
          ul: (props: ListProps) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />,
          ol: (props: ListProps) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />,
          blockquote: (props: BlockquoteProps) => (
            <blockquote 
              className="border-l-4 border-main-border pl-4 italic text-sub-text my-4" 
              {...props} 
            />
          ),
          a: (props: LinkProps) => (
            <a 
              className="text-main-accent hover:underline" 
              target="_blank" 
              rel="noopener noreferrer"
              {...props} 
            />
          ),
};

// Define chapter type for Outline component
type Chapter = {
  id: string;
  title: string;
  shortVideos?: Array<{ 
    id: string;
    title: string;
    startTime: number | null;
    endTime: number | null;
    duration: number | null;
    videoUrl: string;
    downloadUrl: string | null;
    thumbnailUrl: string | null;
    processingType: ProcessingType | null;
    customQuery: string | null;
    relevanceScore: number | null;
    orderIndex: number | null;
    createdAt: Date | string;
  }>;
};

// Updated Outline component with clickable headings
const Outline = ({ content }: { content: string }) => {
  const [headings, setHeadings] = useState<Array<{ level: number; text: string; id: string }>>([]);

  useEffect(() => {
    // Parse headings from markdown content
    const lines = content.split('\n');
    const parsedHeadings: Array<{ level: number; text: string; id: string }> = [];
    lines.forEach(line => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        let text = match[2].trim();
        // Remove HTML anchor if present
        text = text.replace(/<a id='[^']+'><\/a>/, '');
        const id = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
        parsedHeadings.push({ level, text, id });
      }
    });
    setHeadings(parsedHeadings);
  }, [content]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (headings.length === 0) return null;

  return (
    <div className="outline border border-subtle-border rounded p-6 sticky top-4 max-h-96 overflow-y-auto">
      <h3 className="font-semibold mb-2">Outline</h3>
      <ul className="space-y-1">
        {headings.map((heading, index) => (
          <li key={index} style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}>
            <button
              onClick={() => scrollToHeading(heading.id)}
              className="text-main-accent hover:underline text-left"
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Define the return type for the action function
interface ActionData {
  error?: string;
  details?: string;
  extractedText?: string;
  filename?: string;
  formattedMarkdown?: string;
  warning?: string;
  success?: boolean;
  message?: string;
};

// Extend the Course type to include our custom fields
interface CourseWithExtras extends Omit<Course, 'chapters' | 'createdAt' | 'updatedAt'> {
  filePath: string | null;
  textContent: string | null;
  chapters: Array<{ 
    id: string;
    title: string;
    shortVideos: Array<{ 
      id: string;
      title: string;
      startTime: number | null;
      endTime: number | null;
      duration: number | null;
      videoUrl: string;
      downloadUrl: string | null;
      thumbnailUrl: string | null;
      processingType: ProcessingType | null;
      customQuery: string | null;
      relevanceScore: number | null;
      orderIndex: number | null;
      createdAt: Date | string;
    }>;
  }>;
};

function parseDates<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(parseDates) as unknown as T;
  }

  if (obj instanceof Date) {
    return obj;
  }

  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Convert date strings to Date objects
    if ((key.endsWith('At') || key === 'createdAt' || key === 'updatedAt') && value) {
      result[key] = value instanceof Date ? value : new Date(value as string);
    } 
    // Recursively process nested objects and arrays
    else if (value && typeof value === 'object') {
      result[key] = parseDates(value);
    } 
    // Keep other values as-is
    else {
      result[key] = value;
    }
  }

  return result as T;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const id = params.id || "";
  if (!id) return json({ error: "Missing course id" }, { status: 400 });
  
  const course = await getCourseById(id);
  if (!course) return json({ error: "Course not found" }, { status: 404 });
  
  // Parse dates in the course object
  const parsedCourse = parseDates(course);
  
  return json({ course: parsedCourse });
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { id } = params;
  if (!id) {
    return json<ActionData>({ error: 'Course ID is required' }, { status: 400 });
  }

  // Get the form data
  const formData = await request.formData();
  const intent = formData.get('intent')?.toString() || '';

  if (!intent) {
    return json<ActionData>({ error: 'No action specified' }, { status: 400 });
  }

  // Get the course
  const course = await getCourseById(id);
  if (!course) {
    return json<ActionData>({ error: 'Course not found' }, { status: 404 });
  }

  // Handle different intents
  switch (intent) {
    case 're-extract':
    case 'extract': {
      if (intent === 'extract' && course.textContent) {
        // If we already have text content, return it for 'extract' intent
        return json<ActionData>({
          extractedText: course.textContent,
          filename: `${safeFilename(course.title || 'document')}.txt`
        });
      }

      if (!course.filePath) {
        return json<ActionData>({ error: 'No PDF file found for this course' }, { status: 400 });
      }

      try {
        // Ensure filePath is a-non-empty string
        if (!course.filePath) {
          return json<ActionData>({ error: 'No file path available for extraction' }, { status: 400 });
        }

                const relFilePath = course.filePath!.replace(/^[\\\/\-]+\//, "");
        const pdfPath = path.join(process.cwd(), "public", relFilePath);

        // Adobe-only extraction; no local fallback, no image persistence
        const adobeResult = await extractTextFromPdfWithAdobe(pdfPath);
        if ('error' in adobeResult) {
          return json<ActionData>({ error: adobeResult.error || 'Unknown error during PDF extraction' }, { status: 500 });
        }
        
        const rawText = (adobeResult.text || "").trim();
        if (!rawText) {
          return json<ActionData>(
            { error: "No text content found in PDF via Adobe Extract." }, 
            { status: 400 }
          );
        }

        // Store the extracted text in the course
        await prisma.course.update({
          where: { id },
          data: { textContent: rawText }
        });

        return json<ActionData>({
          extractedText: rawText,
          filename: `${safeFilename(course.title || 'document')}.txt`
        });
      } catch (error: any) {
        return json({ error: `Extraction failed: ${error?.message || error}` }, { status: 500 });
      }
    }

    case 'formatWithGemini': {
      try {
        const content = formData.get('content')?.toString();
        const mode = formData.get('mode')?.toString() as 'brief' | 'detail' | 'original' || 'original';
        const theme = formData.get('theme')?.toString() || 'light';
        if (!content) {
          return json<ActionData>({ error: 'No content provided to format' }, { status: 400 });
        }

        const result = await formatWithGemini(content, mode);

        if (result.error || !result.text) {
          return json<ActionData>({ error: result.error || 'Gemini returned empty response' }, { status: 500 });
        }

        const outputPath = path.join(process.cwd(), "public", "downloads", "pdfs", id, `${safeFilename(course.title || 'document')}.pdf`);
        await createPdfFromHtml(result.text, outputPath, theme);

        const latestVersion = await prisma.formattedVersion.findFirst({
          where: { courseId: id },
          orderBy: { version: 'desc' },
          select: { version: true }
        });
        
        const newVersion = (latestVersion?.version || 0) + 1;

        await prisma.formattedVersion.create({
          data: {
            courseId: id,
            content: result.text,
            version: newVersion
          }
        });

        // Redirect to the page and select the new version
        return redirect(`/dashboard/courses/${id}?version_created=${newVersion}`);

      } catch (error) {
        console.error('Error in formatWithGemini action:', error);
        return json<ActionData>(
          { error: 'Failed to format with Gemini', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    }

    case 'generateShort': {
      const shortId = formData.get('shortId')?.toString();
      if (!shortId) {
        return json<ActionData>({ error: 'shortId not provided' }, { status: 400 });
      }
      const result = await generateShortForEntry(shortId);
      if (!result.ok) {
        return json<ActionData>({ error: result.error }, { status: 500 });
      }
      return json<ActionData>({ success: true, message: 'Short generated successfully' });
    }

    default:
      // If we get here, we have an unsupported intent
      return json<ActionData>(
        { error: 'Unsupported action' },
        { status: 400 }
      );
  }
}

export default function CourseDetailRoute() {
  const { theme } = useTheme();
  const data = useLoaderData<typeof loader>();
  const params = useParams();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showUpdated, setShowUpdated] = useState(searchParams.get("updated") === "1");
  const [showOutline, setShowOutline] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    if (searchParams.get("updated") === "1") {
      setShowUpdated(true);
      const t = setTimeout(() => setShowUpdated(false), 2200);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const versionCreated = searchParams.get("version_created");
  
  const isProcessing = navigation.state !== 'idle' &&
    (navigation.formData?.get('intent') === 'formatWithGemini' ||
     navigation.formData?.get('intent') === 'extract' ||
     navigation.formData?.get('intent') === 're-extract');
  const shortId = params.shortId as string | undefined;
  
  if ("error" in data) {
    return (
      <div className="rounded border border-error-border bg-error-bg p-4 text-sm text-error-text">
        {data.error}
      </div>
    );
  }
  
  const course = data.course as unknown as Course;
  const isTextBasedCourse = course.contentType === "pdf_textbook" || course.contentType === "audiobook_text" || course.contentType === "youtube_text";

  // Initialize state with values that match server render
  const [selectedVersion, setSelectedVersion] = useState<number>(0);
  const [selectedContent, setSelectedContent] = useState<string>(course.textContent || "");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // When re-extraction is complete, switch to the raw content view
    if (actionData?.extractedText) {
      setSelectedVersion(0);
    }
  }, [actionData]);

  useEffect(() => {
    if (!isMounted) {
      setIsMounted(true);
      // Restore selected version from localStorage on initial mount
      if (isTextBasedCourse) {
        const savedVersion = localStorage.getItem(`selectedVersion_${course.id}`);
        if (savedVersion) {
          setSelectedVersion(Number(savedVersion));
        }
      }
    }
    const versionFromUrl = searchParams.get("version_created");
    if (versionFromUrl) {
      const newVersion = parseInt(versionFromUrl, 10);
      if (!isNaN(newVersion)) {
        setSelectedVersion(newVersion);
      }
      // Clean the URL
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("version_created");
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isMounted, isTextBasedCourse, course.id]);
  

  const handleVersionChange = (newVersion: number) => {
    setSelectedVersion(newVersion);
    if (newVersion === 0) {
      setSelectedContent(course.textContent || "");
    } else {
      const versionContent = course.formattedVersions?.find(
        (v: { version: number }) => v.version === newVersion
      )?.content;
      setSelectedContent(versionContent || course.textContent || "");
    }
  };

  // Handle content updates when version changes
  useEffect(() => {
    if (!isMounted) return;

    // Save selected version to localStorage for PDF courses
    if (isTextBasedCourse) {
      localStorage.setItem(`selectedVersion_${course.id}`, selectedVersion.toString());
    }
    
    // Update content based on selected version
    if (selectedVersion === 0) {
      setSelectedContent(course.textContent || "");
    } else {
      const versionContent = course.formattedVersions?.find(
        (v: { version: number }) => v.version === selectedVersion
      )?.content;
      setSelectedContent(versionContent || course.textContent || "");
    }
  }, [selectedVersion, course.textContent, course.formattedVersions, isTextBasedCourse, isMounted, course.id]);
  
  const seekAudio = (time: number | null) => {
    if (time !== null && audioRef.current) {
      audioRef.current.currentTime = time;
      audioRef.current.play();
    }
  };

  // Estimate read time from current markdown (words/min ~200)
  const estReadMin = useMemo(() => {
    const md = String(course?.textContent || "");
    if (!md) return 0;
    const text = md
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/![[^]]*\]\([^)]*\)/g, " ")
      .replace(/\\[^\\]*\]\([^)]*\)/g, " ")
      .replace(/<[^>]*>/g, " ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }, [course?.textContent]);
  if (shortId) {
    // Dedicated clip page: render only the nested short route content
    return (
      <>
        <Outlet />
      </>
    );
  }
  return (
    <div className="w-full">
      <div className="mb-4">
        <Button asChild variant="link">
          <Link to="/dashboard/courses">&larr; Back to Courses</Link>
        </Button>
      </div>
    {showUpdated && (
      <div className="fixed right-4 top-4 z-50 rounded-md bg-success-bg px-3 py-2 text-xs font-medium text-success-text shadow-lg">
        Updated
      </div>
    )}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Outline for larger screens */}
        {isTextBasedCourse && course.chapters?.length > 0 && (
          <div className="hidden md:block md:w-64 md:order-2 flex-shrink-0">
            <div className="sticky top-6 bg-main-bg rounded-lg shadow p-4">
              <h3 className="font-semibold text-lg mb-3 text-primary">Outline</h3>
              <div className="text-sm text-main-text">
                <Outline content={selectedContent || course.textContent || ""} />
              </div>
            </div>
          </div>
        )}
        <div className="w-full md:flex-1 md:order-1 space-y-6 flex-grow sepia:border-sepia-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{course.title}</h2>
              <p className="text-sm opacity-70">{course.description || ""}</p>
              <div className="mt-2 rounded border border-subtle-border bg-subtle-bg p-2 text-xs">
                <div className="font-mono text-opacity-80">ID: {course.id}</div>
                {actionData && 'error' in actionData && actionData.error && (
          <div className="rounded border border-error-border bg-error-bg p-4 text-sm text-error-text">
            {actionData.error}
            {actionData.details && <div className="mt-1 text-xs opacity-80">{actionData.details}</div>}
          </div>
        )}

        {!isTextBasedCourse && (
          <div className="flex items-center gap-3">
            <Form method="post">
              <input type="hidden" name="intent" value="generateAll" />
              <Button variant="primary" size="sm">Generate all clips</Button>
            </Form>
          </div>
        )}

        {isTextBasedCourse && (
                  <div className="font-mono text-opacity-80">PDF path: {course.filePath || "(not set)"}</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Audio Player for audio courses */}
          {(course.contentType === "audiobook" || course.contentType === "audiobook_text") && course.filePath && (
            <div className="mt-4">
              <audio controls src={course.filePath} className="w-full" ref={audioRef}></audio>
            </div>
          )}

          {/* Toggle for mobile outline */}
          {isTextBasedCourse && (
            <div className="md:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOutline(!showOutline)}
              >
                {showOutline ? "Hide Outline" : "Show Outline"}
              </Button>
            </div>
          )}

          {/* Mobile Outline */}
          {showOutline && isTextBasedCourse && course.chapters?.length > 0 && (
            <div className="md:hidden">
              <div className="sepia:bg-sepia dark:bg-gray-900 sepia:bg-sepia rounded-lg shadow p-6">
                <h3 className="font-semibold text-lg mb-3 text-primary">Outline</h3>
                <div className="text-sm text-main-text">
                  <Outline content={selectedContent || course.textContent || ""} />
                </div>
              </div>
            </div>
          )}

        {actionData && 'error' in actionData && actionData.error && (
          <div className="rounded border border-error-border bg-error-bg p-4 text-sm text-error-text">
            {actionData.error}
            {actionData.details && <div className="mt-1 text-xs opacity-80">{actionData.details}</div>}
          </div>
        )}

        {!isTextBasedCourse && (
          <div className="flex items-center gap-3">
            <Form method="post">
              <input type="hidden" name="intent" value="generateAll" />
              <Button variant="primary" size="sm">Generate all clips</Button>
            </Form>
          </div>
        )}

        {isTextBasedCourse && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded border border-subtle-border p-4">
              <div>
                <div className="font-medium">Notebook Content</div>
              </div>
              <div className="flex items-center gap-3">
                {course?.textContent && (
                  <span className="text-xs opacity-70" title="Estimated read time">Est. {estReadMin}m</span>
                )}
                {course.sourceUrl && (
                  <a href={course.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-main-accent hover:underline">Open original file</a>
                )}
                <div className="flex items-center gap-2 mr-4">
                  {isTextBasedCourse && (
                    <VersionSelector 
                      course={course} 
                      onVersionChange={handleVersionChange}
                      selectedVersion={selectedVersion}
                    />
                  )}
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="re-extract" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-warn-border text-warn-text hover:bg-warn-bg"
                    disabled={isProcessing}
                  >
                    {isProcessing && navigation.formData?.get('intent') === 're-extract' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Re-extracting...
                      </span>
                    ) : (
                      "Re-extract Text"
                    )}
                  </Button>
                </Form>
                <Form method="post" className="flex items-center gap-2">
                  <input type="hidden" name="intent" value="formatWithGemini" />
                  <input type="hidden" name="theme" value={theme} />
                  <Button
                    type="submit"
                    name="mode"
                    value="original"
                    variant="primary"
                    size="sm"
                    disabled={isProcessing || !(selectedContent || course.textContent)}
                  >
                    {isProcessing && navigation.formData?.get('intent') === 'formatWithGemini' && navigation.formData?.get('mode') === 'original' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Formatting...
                      </span>
                    ) : (
                      "Format"
                    )}
                  </Button>
                  <Button
                    type="submit"
                    name="mode"
                    value="brief"
                    variant="primary"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={isProcessing || !(selectedContent || course.textContent)}
                  >
                    {isProcessing && navigation.formData?.get('intent') === 'formatWithGemini' && navigation.formData?.get('mode') === 'brief' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Briefing...
                      </span>
                    ) : (
                      "Brief"
                    )}
                  </Button>
                  <Button
                    type="submit"
                    name="mode"
                    value="detail"
                    variant="primary"
                    size="sm"
                    disabled={isProcessing || !(selectedContent || course.textContent)}
                  >
                    {isProcessing && navigation.formData?.get('intent') === 'formatWithGemini' && navigation.formData?.get('mode') === 'detail' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Detailing...
                      </span>
                    ) : (
                      "Detail"
                    )}
                  </Button>
                </Form>
                </div>
              </div>
            
            {/* Main content area */}
            <div className="mt-4 rounded border border-subtle-border bg-main-bg p-6">
              {course.textContent ? (
                <div className="prose max-w-none text-primary">
                  {selectedVersion === 0 ? (
                    <NotebookViewer
                    content={selectedContent}
                    courseId={course.id}
                    key={selectedVersion}
                  />
                  ) : (
                    <NotebookViewer
                      content={selectedContent}
                      courseId={course.id}
                      key={selectedVersion}
                    />
                  )}
                </div>
              ) : !course.filePath ? (
                <div className="rounded border border-info-border bg-info-bg p-6 text-info-text">
                  <p className="mb-4">No PDF file uploaded yet. Please upload a PDF file to get started.</p>
                  <Form method="post" encType="multipart/form-data" className="space-y-4">
                    <div>
                      <label htmlFor="pdfFile" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        PDF File
                      </label>
                      <input
                        type="file"
                        id="pdfFile"
                        name="file"
                        accept=".pdf"
                        className="mt-1 block w-full text-sm text-main-text border border-main-border rounded-lg cursor-pointer bg-subtle-bg focus:outline-none"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      name="intent"
                      value="uploadPdf"
                      variant="primary"
                      size="lg"
                    >
                      Upload PDF
                    </Button>
                  </Form>
                </div>
              ) : (
                <div className="rounded border border-warn-border bg-warn-bg p-6 text-warn-text">
                  <p>No content available. Please extract text from the PDF first.</p>
                  {!isProcessing && (
                    <Form method="post" className="mt-2">
                      <input type="hidden" name="intent" value="extract" />
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                      >
                        Extract Text from PDF
                      </Button>
                    </Form>
                  )}
                </div>
              )}
            </div>
            
            {/* Image extraction status notices */}
            {(() => {
              const adobe = searchParams.get("adobe");
              const images = searchParams.get("images");
              const added = Number(searchParams.get("images_added") || 0);
              if (adobe === "0") {
                return (
                  <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100">
                    Adobe PDF Services was not used. Configure PDF_SERVICES_CLIENT_ID and PDF_SERVICES_CLIENT_SECRET in .env to extract figures.
                  </div>
                );
              }
              if (adobe === "1" && images === "none") {
                return (
                  <div className="rounded border border-blue-300 bg-blue-50 p-2 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                    No figures were extracted from this PDF. Some documents embed math/diagrams as vector content that may not be exported as images.
                  </div>
                );
              }
              if (adobe === "1" && images === "added" && added > 0) {
                return (
                  <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                    Added {added} extracted figure{added === 1 ? "" : "s"} to the end of the notebook.
                  </div>
                );
              }
              return null;
            })()}
            {/* Error/Warning banners from formatting */}
            {actionData && 'error' in actionData && actionData.error && (
              <div className="rounded border border-error-border bg-error-bg p-4 text-sm text-error-text">
                Formatting error: {actionData.error}
                {'details' in actionData && actionData.details && (
                  <div className="mt-1 text-xs">{actionData.details}</div>
                )}
              </div>
            )}
          </div>
        )}

        {!isTextBasedCourse && course.chapters.length === 0 && (
          <p className="rounded border border-gray-200 p-3 text-sm opacity-70 dark:border-gray-800">No chapters yet.</p>
        )}

        <div className="space-y-4">
          {course.chapters.map((ch: any) => (
            <div key={ch.id} id={ch.id} className="rounded border border-gray-200 p-4 dark:border-gray-800 scroll-mt-20 sepia:border-sepia-border">
              <h3 className="font-medium">{ch.title}</h3>
              <div className="mt-2 divide-y divide-gray-200 text-sm dark:divide-gray-800">
                {ch.shortVideos.length === 0 && (
                  <p className="py-3 opacity-70">No segments.</p>
                )}
                {ch.shortVideos.map((s: any) => (
                  <div key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      {String(s.title || '').trim().toLowerCase() !== String(ch.title || '').trim().toLowerCase() && (
                        <div className="font-medium">
                          {s.title}
                        </div>
                      )}
                      {s.customQuery && (
                        <div className="text-sm opacity-80 prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{s.customQuery}</ReactMarkdown>
                        </div>
                      )}
                      <div className="opacity-70">{formatTime(s.startTime)} - {formatTime(s.endTime)} ({formatDurationMinutesRange(s.duration ?? ((s.endTime ?? 0) - (s.startTime ?? 0)))})</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(course.contentType === "audiobook" || course.contentType === "audiobook_text") && s.startTime !== null && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => seekAudio(s.startTime)}
                        >
                          Play
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/dashboard/courses/${course.id}/shorts/${s.id}`}>View</Link>
                      </Button>
                      {s.downloadUrl ? (
                        <Button asChild variant="primary" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                          <a
                            href={s.downloadUrl}
                            download={`${safeFilename(course.title)} - ${safeFilename(s.title)}.mp4`}
                          >
                            Download
                          </a>
                        </Button>
                      ) : (
                        !isTextBasedCourse && (
                          <Form method="post">
                            <input type="hidden" name="intent" value="generateShort" />
                            <input type="hidden" name="shortId" value={s.id} />
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!s.videoUrl}
                              title={!s.videoUrl ? "Missing video URL for this segment" : undefined}
                            >
                              Generate
                            </Button>
                          </Form>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

function formatTime(sec?: number | null) {
  if (sec == null) return "--";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

// Convert seconds to a friendly minutes label: "<1 min", "2min", "1-2min"
function formatDurationMinutesRange(totalSec?: number | null) {
  if (!totalSec) return '';
  const mins = Math.ceil(totalSec / 60);
  return mins <= 1 ? "<1 min" : `${mins} min`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
}

function safeFilename(text: string): string {
  return text
    .replace(/[\/:*?"<>|]/g, '') // Remove Windows forbidden characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .trim()
    .substring(0, 255); // Limit filename length
}
