#!/bin/bash

docker build -t cody_evaluation \
  --build-arg BENCHMARK_ENDPOINT=${BENCHMARK_ENDPOINT} \
  --build-arg BENCHMARK_ACCESS_TOKEN=${BENCHMARK_ACCESS_TOKEN} \
  .

CONTAINER_NAME=$(docker run -d cody_evaluation)
sleep 2
docker exec -it $CONTAINER_NAME /bin/bash
