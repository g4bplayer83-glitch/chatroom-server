FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATA_DIR=/data/data
ENV UPLOAD_DIR=/data/uploads

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data/data /data/uploads

EXPOSE 8080

CMD ["node", "server.js"]