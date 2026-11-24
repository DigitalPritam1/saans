# Use minimal Node 20 Debian Slim image
FROM node:20-slim

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source and assets
COPY . .

# Run as non-root node user for container hardening
USER node

# Expose default Cloud Run port
EXPOSE 8080

# Start Express server
CMD ["node", "server.js"]
