# ============================================================
# STAGE 1: Install production dependencies only
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
RUN npm cache clean --force && npm install --omit=dev


# ============================================================
# STAGE 2: Production image
# ============================================================
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeapp -u 1001 -G nodejs

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps --chown=nodeapp:nodejs /app/node_modules ./node_modules

# Copy your app files (flat structure — everything at root)
COPY --chown=nodeapp:nodejs app.js      ./app.js
COPY --chown=nodeapp:nodejs server.js   ./server.js
COPY --chown=nodeapp:nodejs routes/     ./routes/
COPY --chown=nodeapp:nodejs middleware/ ./middleware/
COPY --chown=nodeapp:nodejs models/     ./models/
COPY --chown=nodeapp:nodejs utils/      ./utils/
COPY --chown=nodeapp:nodejs package.json ./package.json

# Switch to non-root user
USER nodeapp

# ALB health check — hits /health every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-8001}/health || exit 1

EXPOSE ${PORT:-8001}

CMD ["node", "server.js"]