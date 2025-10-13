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

# 4.1 Verify ffmpeg installation and set correct path
if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg installed successfully: $(which ffmpeg)"
  export FFMPEG_PATH="$(which ffmpeg)"
else
  echo "ffmpeg installation failed"
  export FFMPEG_PATH="/usr/bin/ffmpeg"
fi

# Debug: List contents of secrets directory if it exists
echo "Checking secrets directory contents..."
if [ -d "/etc/secrets" ]; then
  echo "Contents of /etc/secrets:"
  ls -la /etc/secrets/
else
  echo "/etc/secrets directory does not exist"
fi

# 5. Set environment variables for yt-dlp and ffmpeg paths
#    These are needed because the app runs from /opt/render/project/src/web/
export YTDLP_PATH="/opt/render/project/src/web/.bin/yt-dlp"
# FFMPEG_PATH is already set above

# Debug: Show all relevant environment variables
echo "=== Environment Variables Set ==="
echo "YTDLP_PATH: $YTDLP_PATH"
echo "FFMPEG_PATH: $FFMPEG_PATH"
echo "================================"

# 6. Run Prisma migrations and build the application
npx prisma migrate deploy
npm run build
