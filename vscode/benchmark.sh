#!/bin/sh

export BENCHMARK_DOCKER_IMAGE=cody-benchmark-harness

# Build the test harness, installs any required dependencies for tests
docker build -f ./test/benchmark/datasets/Dockerfile -t $BENCHMARK_DOCKER_IMAGE .

# Note: This is outside Docker so we can easily access VS Code whilst it runs.
# Only the generated code is evaluated inside Docker (executed from within this script)
node dist/tsc/test/benchmark/main.js
