#!/bin/bash

IMAGE_NAME="cody-evaluation"

# Build the Docker image
docker build -t $IMAGE_NAME -f ./evaluation-tool/Dockerfile .

# Run the container in detached mode
docker run --init $IMAGE_NAME
