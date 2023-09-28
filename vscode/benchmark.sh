#!/bin/sh

[ -z "$BENCHMARK_ENDPOINT" ] && echo "BENCHMARK_ENDPOINT not provided" 1>&2 && exit 1
[ -z "$BENCHMARK_ACCESS_TOKEN" ] && echo "BENCHMARK_ACCESS_TOKEN not provided" 1>&2 && exit 1

export BENCHMARK_DOCKER_IMAGE=cody-benchmark-harness

# Build the test harness, installs any required dependencies for tests
docker build -f ./test/benchmark/datasets/Dockerfile -t $BENCHMARK_DOCKER_IMAGE .

# Note: This is outside Docker so we can easily access VS Code whilst it runs.
# Only the generated code is evaluated inside Docker (executed from within this script)
node dist/tsc/test/benchmark/main.js
