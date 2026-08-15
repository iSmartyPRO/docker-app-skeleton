# Multi-stage build for production

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
ARG APP_VERSION=
WORKDIR /app/frontend
COPY VERSION /app/VERSION
COPY src/frontend/package*.json ./
RUN npm install
COPY src/frontend/ ./
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build

# Stage 2: Build backend (install dependencies)
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY src/backend/package*.json ./
RUN npm install --omit=dev

# Stage 3: Production image
FROM node:20-alpine
ARG APP_VERSION=
LABEL org.opencontainers.image.version="${APP_VERSION}"
WORKDIR /app

# Install nginx
RUN apk add --no-cache nginx

# Copy backend
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY src/backend ./backend
COPY VERSION /app/VERSION

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start nginx and backend
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Create nginx directories
RUN mkdir -p /var/log/nginx /var/cache/nginx /run/nginx /app/uploads/avatars /app/uploads/logos

ENV APP_VERSION=$APP_VERSION

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["./start.sh"]
