# Multi-stage build for production-ready image
FROM node:18-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache python3 make g++ curl

# Copy package files
COPY package*.json ./
COPY packages/*/package*.json packages/*/

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build application
RUN npm run build --if-present

# Production runtime stage
FROM node:18-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1000 app && adduser -u 1000 -G app app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Copy from builder
COPY --from=builder --chown=app:app /build .

# Set environment
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048" \
    PORT=43120

# Health check script
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:43120/health || exit 1

# Security: read-only root filesystem + tmpfs
RUN chmod -R o-rwx /app && \
    mkdir -p /tmp /run && \
    chown -R app:app /tmp /run

# Switch to non-root user
USER app:app

# Expose port
EXPOSE 43120

# Run with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/agent/src/index.js"]
