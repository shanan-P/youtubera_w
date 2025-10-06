import { prisma } from "~/utils/db.server";

export async function searchCourses(query: string) {
  if (!query) {
    return [];
  }

  const courses = await prisma.$queryRaw`
    SELECT
      id,
      title,
      description,
      "thumbnailUrl",
      "sourceUrl",
      ts_headline('english', "textContent", to_tsquery('english', ${query.split(' ').join(' & ')}), 'StartSel=<b>, StopSel=</b>, MaxFragments=1, FragmentDelimiter=..., MaxWords=15, MinWords=5') AS "highlight"
    FROM "Course"
    WHERE "search_vector" @@ to_tsquery('english', ${query.split(' ').join(' & ')})
    ORDER BY ts_rank("search_vector", to_tsquery('english', ${query.split(' ').join(' & ')})) DESC;
  `;

  return courses;
}
