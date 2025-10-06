"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileDetails = getFileDetails;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
function getFileDetails(file) {
    const filePath = file.getFilePath();
    const buffer = (0, node_fs_1.readFileSync)(filePath);
    return {
        name: (0, node_path_1.basename)(filePath),
        type: file.type,
        size: buffer.length,
        arrayBuffer: () => Promise.resolve(buffer),
    };
}
