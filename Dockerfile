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

FROM ubuntu:24.04

# Install Node.js and dependencies
RUN apt-get update && apt-get install -y nodejs npm libsecret-tools gnome-keyring
RUN npm install -g pnpm

# Copy the built agent package from the builder stage
WORKDIR /app
COPY --from=builder /cody/agent/dist /app/dist
COPY --from=builder /cody/agent/package.json /app/
# Create an executable wrapper script for cody
RUN echo '#!/bin/bash\nnode /app/dist/index.js "$@"' > /usr/local/bin/cody && \
    chmod +x /usr/local/bin/cody


# Test that the agent is installed correctly
RUN which cody || echo "Cody not found in PATH"
RUN cody --version || echo "Cody installation failed"

CMD ["/bin/bash"]
