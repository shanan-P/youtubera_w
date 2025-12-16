# youtubera_w

A web application.

This repository contains the source code for the `youtubera_w` project, which includes:
- `/web`: A Remix web application.
- `/scripts`: Helper scripts.

Create Env File and set DATABASE_URL, REDIS_URL, API Keys:

Optionally install ffmpeg, yt-dlp

Database Sync & App Run:

npx prisma db push

npx prisma generate

npm run dev

Running the app inside container:
HOST=127.0.0.1 npm run dev
