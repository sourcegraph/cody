#!/usr/bin/env bash
set -eu

echo "====================================================="
echo "= Copying protocol files from CODY_DIR              ="
echo "====================================================="

# if CODY_DIR is not set then we assume it's relative to the gitroot (look that up)
# and then ../cody/ (which will need to be converted into an absolute path)
if [ -z "${CODY_DIR:-}" ]; then
  CODY_DIR="$(git rev-parse --show-toplevel)/../cody/"
  echo "CODY_DIR is not set so using ${CODY_DIR}"
fi
CODY_DIR="$CODY_DIR" ./gradlew copyProtocol -PforceProtocolCopy=true