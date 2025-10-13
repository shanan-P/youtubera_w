#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install project dependencies
npm install

# 2. Create a directory for our binaries inside the web directory
mkdir -p .bin

# 3. Download and install yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o .bin/yt-dlp
chmod a+rx .bin/yt-dlp

# 4. Install ffmpeg
#    Render's native environments are Debian-based, so we can use apt-get.
apt-get update && apt-get install -y ffmpeg

# 5. Set environment variables for yt-dlp and ffmpeg paths
#    These are needed because the app runs from /opt/render/project/src/web/
export YTDLP_PATH="/opt/render/project/src/web/.bin/yt-dlp"
export FFMPEG_PATH="ffmpeg"

# 6. Run Prisma migrations and build the application
npx prisma migrate deploy
npm run build
