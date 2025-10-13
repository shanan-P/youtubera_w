#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install project dependencies
npm install

# 2. Create a directory for our binaries
mkdir -p ./.bin

# 3. Download and install yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./.bin/yt-dlp
chmod a+rx ./.bin/yt-dlp

# 4. Install ffmpeg
#    Render's native environments are Debian-based, so we can use apt-get.
apt-get update && apt-get install -y ffmpeg

# 5. Set the absolute path for the yt-dlp binary
#    This ensures we use our downloaded version, not a system-wide old one.
export YTDLP_PATH="$RENDER_PROJECT_ROOT/.bin/yt-dlp"

# 5. Run Prisma migrations and build the application
npx prisma migrate deploy
npm run build
