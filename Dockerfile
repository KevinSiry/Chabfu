# syntax=docker/dockerfile:1

# --- Dépendances -------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/client/package.json apps/client/
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

# --- Production : fichiers statiques servis par Nginx -------------------------
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
