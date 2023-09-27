FROM node:18 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY . /app
WORKDIR /app

RUN apt update && apt install -y libasound2 libgbm1 libgtk-3-0 libnss3 xvfb

RUN pnpm install

RUN pnpm run build

WORKDIR /app/vscode

ENV DISPLAY=':99.0'
RUN /usr/bin/Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 & echo ">>> Started xvfb"

ARG BENCHMARK_ENDPOINT
ARG BENCHMARK_ACCESS_TOKEN
ENV BENCHMARK_ENDPOINT=$BENCHMARK_ENDPOINT
ENV BENCHMARK_ACCESS_TOKEN=$BENCHMARK_ACCESS_TOKEN

CMD ["xvfb-run", "-a", "pnpm", "run", "test:benchmark"]
