FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/api

COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
RUN npm run build --workspace apps/api

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Fonts + shared libs for the @sparticuz/chromium binary used to render PDFs.
# The Chromium binary itself is bundled by the npm package (extracted to /tmp);
# these provide font glyphs and the handful of system libs it links against.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-color-emoji \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace apps/api

COPY --from=build /app/apps/api/dist apps/api/dist

EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
