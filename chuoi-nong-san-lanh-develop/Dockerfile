FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN npm ci --omit=dev
COPY --from=build /app/backend backend
COPY --from=build /app/frontend/dist frontend/dist
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "backend"]
