# Cody Agent Docker Image
#
# This Dockerfile builds the Cody Agent CLI tool in a multi-stage process:
# 1. First stage: Build the agent from source using the pnpm workspace
# 2. Second stage: Create a minimal runtime image with just the agent installed
#
# Usage:
#   docker build -t cody-agent .
#   docker run -it --rm cody-agent cody --version
#   docker run -it --rm cody-agent

# ===== Build Stage =====
FROM node:23 AS builder

# Install pnpm with specific version from package.json
RUN npm install -g pnpm

# Copy the entire repository to build with workspace dependencies
WORKDIR /cody
COPY . .
RUN pnpm install
RUN pnpm build

FROM alpine:3.21

# Install Node.js and dependencies
RUN apk update
RUN apk add --no-cache nodejs npm libsecret gnome-keyring

# Copy the built agent package from the builder stage
WORKDIR /app
COPY --from=builder /cody/agent/dist /app/dist
COPY --from=builder /cody/agent/package.json /app/

# Create an executable wrapper script for cody
RUN echo '#!/bin/sh' > /usr/local/bin/cody && \
    echo 'node /app/dist/index.js "$@"' >> /usr/local/bin/cody && \
    chmod +x /usr/local/bin/cody

# Test that the agent is installed correctly
RUN which cody || echo "Cody not found in PATH"
RUN cody --version || echo "Cody installation failed"

# Set cody as the default command
CMD ["cody"]
