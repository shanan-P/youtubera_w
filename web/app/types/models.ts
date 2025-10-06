// Centralized app-facing model types
// Prefer importing types from here instead of @prisma/client directly

import type {
  User,
  Course,
  Chapter,
  ShortVideo,
  TextSection,
  UserProgress,
  Follow,
  Post,
  PrivateMessage,
  LearningActivity,
  Certificate
} from "@prisma/client";

export type {
  User,
  Course,
  Chapter,
  ShortVideo,
  TextSection,
  UserProgress,
  Follow,
  Post,
  PrivateMessage,
  LearningActivity,
  Certificate
};

// Import Prisma's generated types
import type { $Enums } from '@prisma/client';

// Re-export enum types for convenience
export type Role = $Enums.Role;
export type ContentType = $Enums.ContentType;

type ChapterContentType = 'video' | 'pdf' | 'audio';

// Export the Prisma enum type
export { ChapterContentType };

// Create a type-safe object for the enum values
export const ChapterContent = {
  VIDEO: 'video' as ChapterContentType,
  PDF: 'pdf' as ChapterContentType,
  AUDIO: 'audio' as ChapterContentType
};

// Re-export the type for convenience
export type ProcessingType = $Enums.ProcessingType;
