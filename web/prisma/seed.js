// Prisma seed script (ESM)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Admin (requested)
  const adminEmail = "pancholiansh17@gmail.com";
  const adminPassword = "admin123";
  const adminHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "admin", isVerified: true, passwordHash: adminHash },
    create: {
      username: "admin",
      email: adminEmail,
      role: "admin",
      isVerified: true,
      passwordHash: adminHash
    }
  });

  // Users
  const demo = await prisma.user.upsert({
    where: { email: "demo@youtubera.local" },
    update: {},
    create: {
      username: "demo",
      email: "demo@youtubera.local",
      role: "learner",
      isVerified: true
    }
  });

  const creator = await prisma.user.upsert({
    where: { email: "creator@youtubera.local" },
    update: {},
    create: {
      username: "creator",
      email: "creator@youtubera.local",
      role: "youtuber",
      isVerified: true
    }
  });

  // Course
  const course = await prisma.course.upsert({
    where: { id: "seed-course-1" },
    update: {},
    create: {
      id: "seed-course-1",
      title: "Intro to Algorithms (YouTube Playlist)",
      contentType: "youtube_playlist",
      description: "Sample seeded course",
      youtuberName: "AlgoTutor",
      channelName: "AlgoTutor Channel",
      thumbnailUrl: null,
      sourceUrl: "https://www.youtube.com/playlist?list=PL123",
      totalDuration: 3600,
      createdById: creator.id
    }
  });

  // Chapters
  const ch1 = await prisma.chapter.upsert({
    where: { id: "seed-ch-1" },
    update: {},
    create: {
      id: "seed-ch-1",
      courseId: course.id,
      title: "Chapter 1: Basics",
      contentType: "video",
      orderIndex: 1
    }
  });

  await prisma.chapter.upsert({
    where: { id: "seed-ch-2" },
    update: {},
    create: {
      id: "seed-ch-2",
      courseId: course.id,
      title: "Chapter 2: Searching",
      contentType: "video",
      orderIndex: 2
    }
  });

  // Posts
  await prisma.post.create({
    data: {
      userId: demo.id,
      courseId: course.id,
      content: "Excited to learn!",
      isModerated: true
    }
  });

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
