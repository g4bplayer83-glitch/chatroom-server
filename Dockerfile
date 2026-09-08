FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data/data /data/uploads
ENV PORT=8080 HOST=0.0.0.0 DATA_DIR=/data/data UPLOAD_DIR=/data/uploads
EXPOSE 8080
CMD ["node","server.js"]
