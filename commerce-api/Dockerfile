# syntax=docker/dockerfile:1
# Imagem de produção da commerce-api. Construída de forma independente:
#   docker build -t commerce-api .
#   docker run --env-file .env -p 3350:3350 commerce-api

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json prisma.config.ts build.mjs ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# prisma (CLI) fica nas dependências de produção para aplicar migrations no start.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./
USER node
EXPOSE 3350
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-3350}/health || exit 1
# Aplica migrations pendentes (nunca destrutivas por si só) e inicia a API.
CMD ["npm", "run", "start:prod"]
