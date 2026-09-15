# Build from the repository root; the npm package lives in src/.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY src/package.json src/package-lock.json ./
RUN npm ci

FROM deps AS build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
COPY src/ ./
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
RUN npm run typecheck && npm run build

FROM node:22-bookworm-slim AS production-deps
WORKDIR /app
COPY src/package.json src/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/ahmedesmail01/velocitygrowth"
LABEL org.opencontainers.image.revision=$REVISION
COPY --from=production-deps --chown=node:node /app/ ./
COPY --from=build --chown=node:node /app/.next/ ./.next/
COPY --from=build --chown=node:node /app/public/ ./public/
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/ahmedesmail01/velocitygrowth"
LABEL org.opencontainers.image.revision=$REVISION
COPY --from=production-deps --chown=node:node /app/ ./
COPY --chown=node:node src/worker/ ./worker/
RUN node --check worker/run.mjs && node --check worker/provider.mjs
USER node
CMD ["node", "worker/run.mjs"]
