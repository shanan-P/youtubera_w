"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPost = createPost;
exports.getPostById = getPostById;
exports.listPostsByCourse = listPostsByCourse;
exports.listPostsByUser = listPostsByUser;
exports.moderatePost = moderatePost;
exports.deletePost = deletePost;
const db_server_1 = require("~/utils/db.server");
async function createPost(data) {
    return db_server_1.prisma.post.create({
        data: {
            userId: data.userId,
            courseId: data.courseId,
            content: data.content,
            isModerated: data.isModerated ?? false
        }
    });
}
async function getPostById(id) {
    return db_server_1.prisma.post.findUnique({ where: { id } });
}
async function listPostsByCourse(courseId) {
    return db_server_1.prisma.post.findMany({ where: { courseId }, orderBy: { createdAt: "desc" } });
}
async function listPostsByUser(userId) {
    return db_server_1.prisma.post.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}
async function moderatePost(id, isModerated) {
    return db_server_1.prisma.post.update({ where: { id }, data: { isModerated } });
}
async function deletePost(id) {
    return db_server_1.prisma.post.delete({ where: { id } });
}
