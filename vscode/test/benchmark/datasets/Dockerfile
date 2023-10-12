FROM node:20-slim

# Add test dependencies
RUN npm install -g ts-node
RUN apt update && apt install python3 -y
RUN apt update && apt install golang -y

WORKDIR /app
