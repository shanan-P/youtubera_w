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

# 5. Set up cookies if they exist in secrets
echo "Checking for cookies file in secrets..."
if [ -f "/etc/secrets/youtube.txt" ]; then
  echo "Found cookies file at /etc/secrets/youtube.txt"
  echo "Setting up cookies file..."
  mkdir -p .cookies
  # Copy the read-only secret to a writable location
  cp /etc/secrets/youtube.txt .cookies/cookies.txt
  chmod 600 .cookies/cookies.txt
  echo "Cookies file copied to .cookies/cookies.txt"
else
  echo "No cookies file found at /etc/secrets/youtube.txt"
fi

# 6. Set environment variables for yt-dlp and ffmpeg paths
#    These are needed because the app runs from /opt/render/project/src/web/
export YTDLP_PATH="/opt/render/project/src/web/.bin/yt-dlp"
# FFMPEG_PATH is already set above
# Set cookies file path to writable location if it exists
if [ -f ".cookies/cookies.txt" ]; then
  export YTDLP_COOKIES_FILE="/opt/render/project/src/web/.cookies/cookies.txt"
  echo "Set YTDLP_COOKIES_FILE to $YTDLP_COOKIES_FILE"
fi

# Debug: Show all relevant environment variables
echo "=== Environment Variables Set ==="
echo "YTDLP_PATH: $YTDLP_PATH"
echo "FFMPEG_PATH: $FFMPEG_PATH"
echo "YTDLP_COOKIES_FILE: $YTDLP_COOKIES_FILE"
echo "================================"

# 7. Run Prisma migrations and build the application
npx prisma migrate deploy
npm run build
