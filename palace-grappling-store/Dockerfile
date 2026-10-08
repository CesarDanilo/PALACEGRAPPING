# syntax=docker/dockerfile:1
# Imagem da loja (arquivos estáticos servidos por Nginx sem privilégios).
#   docker build --build-arg VITE_API_URL=https://api.exemplo.com -t palace-grappling-store .
#   docker run -p 8090:8080 palace-grappling-store
# As variáveis VITE_* são embutidas no build: mudar a API exige novo build.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=""
ARG VITE_STORE_SLUG="palace-grappling"
ENV VITE_API_URL=$VITE_API_URL VITE_STORE_SLUG=$VITE_STORE_SLUG
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
