"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const video_server_1 = require("~/services/video.server");
const path_1 = require("path");
async function testVideoProcessing() {
    const videoPath = (0, path_1.join)(process.cwd(), "Building Agents with OpenAI Agent SDK.mp4");
    console.log(`Attempting to process video: ${videoPath}`);
    // Set environment variables for ffmpeg and yt-dlp if they are not already set
    // This is a placeholder. In a real scenario, these should be properly configured
    // or passed as arguments.
    if (!process.env.FFMPEG_PATH) {
        console.warn("FFMPEG_PATH not set. Ensure ffmpeg is in your system's PATH or set the environment variable.");
    }
    if (!process.env.YTDLP_PATH) {
        console.warn("YTDLP_PATH not set. Ensure yt-dlp is in your system's PATH or set the environment variable.");
    }
    try {
        const result = await (0, video_server_1.processVideo)(videoPath, "ai");
        console.log("Video processing result:", JSON.stringify(result, null, 2));
    }
    catch (error) {
        console.error("Error during video processing:", error);
    }
}
testVideoProcessing();
