# Dev-образ фронтенда: Vite dev-сервер внутри контейнера (изоляция окружения).
# Пересборка при изменении исходников: docker compose -f ../ai-project/docker-compose.yml up -d --build web
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
