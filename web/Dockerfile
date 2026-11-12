# Cloud Run image. Standalone output keeps this small and deterministic —
# buildpack autodetection is convenient but harder to debug under time pressure.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run injects PORT; Next's server.js reads it.
ENV PORT=8080
# Next's standalone server binds to $HOSTNAME, which Docker sets to the container
# name. Listen on every interface so Render's proxy can reach it.
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# The sandbox demo company a fresh start loads (ENGINE_DEMO_START=1).
COPY --from=build /app/demo-seed ./demo-seed
EXPOSE 8080
CMD ["node", "server.js"]
