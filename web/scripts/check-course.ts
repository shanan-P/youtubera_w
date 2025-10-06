import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCourse() {
  try {
    const course = await prisma.course.findUnique({
      where: { id: '8ab02d4b-57bf-4057-9c5f-43914498163d' },
      include: { 
        formattedVersions: true,
        chapters: true
      }
    });
    
    console.log('Course data:', JSON.stringify(course, null, 2));
    
    if (course) {
      console.log('\nText Content Present:', !!course.textContent);
      console.log('Text Content Length:', course.textContent?.length || 0);
      console.log('Formatted Versions:', course.formattedVersions.length);
      console.log('Chapters:', course.chapters.length);
    }
    
  } catch (error) {
    console.error('Error checking course:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCourse();
