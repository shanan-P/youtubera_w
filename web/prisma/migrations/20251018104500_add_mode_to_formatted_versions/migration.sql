-- Add mode field to FormattedVersion model
ALTER TABLE "FormattedVersion" ADD COLUMN "mode" TEXT DEFAULT 'original';
