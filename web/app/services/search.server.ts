import { prisma } from "~/utils/db.server";

export async function searchCourses(query: string) {
  if (!query) {
    return [];
  }

  const processedQuery = query.split(' ').filter(Boolean).map(word => word + ':*').join(' | ');
  const courses = await prisma.$queryRaw`
    SELECT
      id,
      title,
      description,
      "thumbnailUrl",
      "sourceUrl",
      ts_headline('english', "textContent", to_tsquery('english', ${processedQuery}), 'StartSel=<b>, StopSel=</b>, MaxFragments=1, FragmentDelimiter=..., MaxWords=15, MinWords=5') AS "highlight"
    FROM "Course"
    WHERE "search_vector" @@ to_tsquery('english', ${processedQuery})
    ORDER BY ts_rank("search_vector", to_tsquery('english', ${processedQuery})) DESC;
  `;

  return courses;
}
