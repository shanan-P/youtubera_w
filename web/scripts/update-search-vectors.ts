import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const courses = await prisma.course.findMany();

  for (const course of courses) {
    await prisma.$executeRaw`
      UPDATE "Course"
      SET "search_vector" = 
        setweight(to_tsvector('english', COALESCE(${course.title}, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(${course.description}, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(${course.textContent}, '')), 'C')
      WHERE id = ${course.id}
    `;
    console.log(`Updated search vector for course: ${course.title}`);
  }

  console.log("All course search vectors updated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
