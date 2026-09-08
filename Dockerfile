# L'export Godot fait partie du build : le deploy GitHub/Fly inclut le jeu.
FROM debian:bookworm-slim AS godot-export
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip libfontconfig1 libx11-6 libxcursor1 libxinerama1 libxi6 libxrandr2 libgl1 libasound2 libstdc++6 && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location --retry 2 https://github.com/godotengine/godot-builds/releases/download/4.4.1-stable/Godot_v4.4.1-stable_linux.x86_64.zip -o /tmp/godot.zip && unzip -q /tmp/godot.zip -d /tmp/godot && mv /tmp/godot/Godot_v4.4.1-stable_linux.x86_64 /usr/local/bin/godot && chmod +x /usr/local/bin/godot && rm /tmp/godot.zip
RUN curl --fail --location --retry 2 https://github.com/godotengine/godot-builds/releases/download/4.4.1-stable/Godot_v4.4.1-stable_export_templates.tpz -o /tmp/templates.tpz && mkdir -p /root/.local/share/godot/export_templates/4.4.1.stable && unzip -j -q /tmp/templates.tpz 'templates/web_nothreads_release.zip' 'templates/web_nothreads_debug.zip' -d /root/.local/share/godot/export_templates/4.4.1.stable && rm /tmp/templates.tpz
COPY godot/ /projects/
RUN mkdir -p /out/orbit-garden /out/indie-engine && \
    godot --headless --path /projects/orbit-garden --editor --import && \
    godot --headless --path /projects/orbit-garden --export-release Web /out/orbit-garden/index.html && \
    test -s /out/orbit-garden/index.wasm

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=godot-export /out/ /app/public/games/
RUN mkdir -p /data/data /data/uploads
ENV PORT=8080 HOST=0.0.0.0 DATA_DIR=/data/data UPLOAD_DIR=/data/uploads
EXPOSE 8080
CMD ["node","server.js"]
