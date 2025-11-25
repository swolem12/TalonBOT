FROM node:20-alpine

# Install Java for signal-cli and other dependencies
RUN apk add --no-cache openjdk17-jre wget bash curl

# Install signal-cli
ENV SIGNAL_CLI_VERSION=0.13.2
RUN wget -q "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}-Linux.tar.gz" -O /tmp/signal-cli.tar.gz \
    && tar xf /tmp/signal-cli.tar.gz -C /opt/ \
    && ln -sf /opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli /usr/local/bin/ \
    && rm /tmp/signal-cli.tar.gz \
    && signal-cli --version

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Remove devDependencies for smaller image
RUN npm prune --production

# Create data directory for signal-cli
RUN mkdir -p /data/signal-cli /data/db

# Environment variables
ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/db/talonbot.db"
ENV SIGNAL_CLI_DATA_DIR=/data/signal-cli

# Volume for persistent data
VOLUME ["/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Start the bot
CMD ["node", "dist/index.js"]
