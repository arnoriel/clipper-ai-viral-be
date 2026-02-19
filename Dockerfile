FROM node:18

# Install dependencies + Node.js runtime untuk yt-dlp
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip nodejs npm && \
    pip install --break-system-packages yt-dlp

# Set environment variable untuk yt-dlp menggunakan Node.js
ENV YT_DLP_JS_RUNTIME=node

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]