"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = createUser;
exports.getUserById = getUserById;
exports.getUserByEmail = getUserByEmail;
exports.listUsers = listUsers;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
const db_server_1 = require("~/utils/db.server");
async function createUser(data) {
    return db_server_1.prisma.user.create({
        data: {
            username: data.username,
            email: data.email,
            passwordHash: data.passwordHash,
            role: data.role ?? "learner",
            isVerified: data.isVerified ?? false,
            profilePicture: data.profilePicture ?? null,
            bio: data.bio ?? null
        }
    });
}
async function getUserById(id) {
    return db_server_1.prisma.user.findUnique({ where: { id } });
}
async function getUserByEmail(email) {
    return db_server_1.prisma.user.findUnique({ where: { email } });
}
async function listUsers() {
    return db_server_1.prisma.user.findMany({ orderBy: { createdAt: "desc" } });
}
async function updateUser(id, data) {
    return db_server_1.prisma.user.update({ where: { id }, data });
}
async function deleteUser(id) {
    return db_server_1.prisma.user.delete({ where: { id } });
}
