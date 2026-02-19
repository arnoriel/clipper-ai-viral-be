FROM node:18

# Install dependencies + Deno (untuk solve tantangan YouTube)
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip curl unzip && \
    curl -fsSL https://deno.land/install.sh | sh && \
    pip install -U --break-system-packages yt-dlp

# Tambahkan Deno ke PATH
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]