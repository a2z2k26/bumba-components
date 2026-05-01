# Tool Bridge Docker Image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create config directory
RUN mkdir -p /app/.tool-bridge

# Expose port
EXPOSE 3456

# Set environment variables
ENV NODE_ENV=production
ENV TOOL_BRIDGE_CONFIG_DIR=/app/.tool-bridge

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3456/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Run the application
CMD ["node", "src/cli/index.js", "start"]