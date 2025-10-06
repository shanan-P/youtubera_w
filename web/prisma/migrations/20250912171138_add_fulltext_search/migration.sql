-- Add a tsvector column to the Course table
ALTER TABLE "Course" ADD COLUMN "search_vector" tsvector;

-- Create an index on the new column
CREATE INDEX course_search_idx ON "Course" USING gin("search_vector");
