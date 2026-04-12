# syntax=docker/dockerfile:1.7

# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
# Use a fixed version tag to improve caching and avoid re-downloading on every deploy
FROM nginx:1.27-alpine AS runner

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Ensure files are world-readable for nginx worker (and directories traversable)
RUN chmod -R a+rX /usr/share/nginx/html

# Expose port 80 in the container
EXPOSE 80

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
