FROM node:20-slim

# Add test dependencies
RUN npm install -g ts-node pnpm
RUN apt update && apt install python3 -y

WORKDIR /app
