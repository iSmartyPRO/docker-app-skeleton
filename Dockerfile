# Multi-stage build for production

# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
ARG APP_VERSION=
WORKDIR /app/frontend
COPY VERSION /app/VERSION
COPY src/frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY src/frontend/ ./
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build

# Stage 2: Build backend (install dependencies)
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend
COPY src/backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 3: LibreDWG (dwg2dxf) for AutoCAD drawing previews in the Drive module
FROM alpine:3.24 AS libredwg
RUN apk add --no-cache build-base curl xz perl python3 pkgconf
WORKDIR /src
RUN curl -fsSL https://github.com/LibreDWG/libredwg/releases/download/0.14/libredwg-0.14.tar.xz | tar xJ
WORKDIR /src/libredwg-0.14
RUN ./configure --prefix=/opt/libredwg --disable-bindings --enable-release --disable-static CFLAGS="-O2" >/dev/null \
 && make -j"$(nproc)" >/dev/null \
 && make install >/dev/null

# Stage 4: Production image
FROM node:22-alpine
ARG APP_VERSION=
LABEL org.opencontainers.image.version="${APP_VERSION}"
WORKDIR /app

# nginx; Python + smbprotocol for the SMB gateway (Drive module), Pillow for thumbnails
RUN apk add --no-cache nginx python3 py3-cryptography py3-pillow py3-pip \
 && pip install --no-cache-dir --break-system-packages smbprotocol==1.17.0 pyspnego==0.12.4 \
 && apk del py3-pip

# dwg2dxf and its library
COPY --from=libredwg /opt/libredwg/bin/dwg2dxf /usr/local/bin/dwg2dxf
COPY --from=libredwg /opt/libredwg/lib/libredwg.so* /usr/local/lib/

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
