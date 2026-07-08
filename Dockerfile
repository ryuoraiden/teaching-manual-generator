# Runs the app anywhere Docker runs (Render, Railway, Fly.io, DigitalOcean, or
# your own Oracle VM later). The Playwright base image ships Chromium AND all
# the system libraries it needs, so PDF export works without any apt/root steps
# — the thing that breaks Playwright on plain Node hosts.
#
# Image tag MUST match the "playwright" version in package.json (1.61.1) so the
# pre-installed browser matches the client library.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

# Install dependencies from the lockfile first (Docker layer caching: this layer
# is only rebuilt when package files change, not on every code edit).
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the app. fonts/ is committed, so the Malayalam PDF fonts come
# along; node_modules/.next/.env* are excluded via .dockerignore.
COPY . .

# Build the production Next.js bundle.
RUN npm run build

ENV NODE_ENV=production
# `next start` honors the PORT env var; hosts like Render/Railway inject their
# own. Locally it defaults to 3000.
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
