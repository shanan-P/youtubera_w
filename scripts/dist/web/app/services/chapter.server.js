"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChapter = createChapter;
exports.getChapterById = getChapterById;
exports.listChaptersByCourse = listChaptersByCourse;
exports.updateChapter = updateChapter;
exports.deleteChapter = deleteChapter;
exports.createShortVideo = createShortVideo;
exports.listShortVideos = listShortVideos;
exports.createTextSection = createTextSection;
exports.listTextSections = listTextSections;
const db_server_1 = require("~/utils/db.server");
async function createChapter(data) {
    return db_server_1.prisma.chapter.create({ data });
}
async function getChapterById(id) {
    return db_server_1.prisma.chapter.findUnique({
        where: { id },
        include: { shortVideos: true, textSections: true }
    });
}
async function listChaptersByCourse(courseId) {
    return db_server_1.prisma.chapter.findMany({ where: { courseId }, orderBy: { orderIndex: "asc" } });
}
async function updateChapter(id, data) {
    return db_server_1.prisma.chapter.update({ where: { id }, data });
}
async function deleteChapter(id) {
    return db_server_1.prisma.chapter.delete({ where: { id } });
}
async function createShortVideo(data) {
    return db_server_1.prisma.shortVideo.create({ data });
}
async function listShortVideos(chapterId) {
    return db_server_1.prisma.shortVideo.findMany({ where: { chapterId }, orderBy: { orderIndex: "asc" } });
}
async function createTextSection(data) {
    return db_server_1.prisma.textSection.create({ data: { ...data, processingType: data.processingType ?? "ai" } });
}
async function listTextSections(chapterId) {
    return db_server_1.prisma.textSection.findMany({ where: { chapterId }, orderBy: { orderIndex: "asc" } });
}
