"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const video_server_1 = require("../web/app/services/video.server");
const testString = "(Star) (Star)(Star)0:28-1:18 What is OpenAI Agent SDK?:(Star)(Star) The speaker explains the purpose of the OpenAI Agent SDK and its ease of use for building agents.(New Line)";
const parsed = (0, video_server_1.parseCustomFormattedChapter)(testString);
if (parsed) {
    console.log("Start Time:", parsed.startTime);
    console.log("End Time:", parsed.endTime);
    console.log("Title:", parsed.title);
    console.log("Description:", parsed.description);
}
else {
    console.log("Failed to parse the string.");
}
