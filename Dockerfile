# syntax=docker/dockerfile:1

# --- Dépendances -------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/solver/package.json packages/solver/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# --- Dev (Vite avec rechargement à chaud, sources montées en volume) ---------
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@chabfu/client", "--", "--host", "0.0.0.0"]

# --- Build : tests du moteur puis build du client -----------------------------
FROM deps AS build
COPY . .
RUN npm test && npm run build

# --- API de sauvegarde (Node, PostgreSQL) -------------------------------------
FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/solver/package.json packages/solver/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN npm ci --legacy-peer-deps --no-audit --no-fund --omit=dev -w @chabfu/server
COPY apps/server/src apps/server/src
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "--experimental-strip-types", "--no-warnings", "apps/server/src/main.ts"]

# --- Production : fichiers statiques servis par Nginx -------------------------
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
