#!/usr/bin/env bash
set -eu

echo "====================================================="
echo "= Copying protocol files                            ="
echo "====================================================="

CODY_DIR="$(git rev-parse --show-toplevel)" ./gradlew copyProtocol -PforceProtocolCopy=true
