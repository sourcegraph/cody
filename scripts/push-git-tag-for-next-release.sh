#!/usr/bin/env bash
# Run this script to cut a new nightly release.
# No arguments needed, the version is automatically computed.
set -eux

# Check the number of arguments
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 [--stable | --nightly]"
  exit 1
fi

NIGHTLY_SUFFIX=""
# Check the argument and take appropriate action
if [ "$1" == "--stable" ]; then
  # shellcheck disable=SC2162
  read -p "Confirm that you want to run the stable release (y/n): " choice
  if [ "$choice" == "y" ]; then
    echo "Running stable release..."
  else
    echo "Aborted."
    exit 1
  fi
elif [ "$1" == "--nightly" ]; then
  NIGHTLY_SUFFIX="-nightly"
else
  echo "Invalid argument. Usage: $0 [--stable | --nightly]"
  exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
SCRIPT_DIR="$(readlink -f "$SCRIPT_DIR")"
NEXT_VERSION="$(bash "$SCRIPT_DIR/next-release.sh")"
bash "$SCRIPT_DIR/verify-release.sh"
TAG="v$NEXT_VERSION$NIGHTLY_SUFFIX"
echo "$TAG"
git tag -fa "$TAG" -m "$TAG" && git push -f origin "$TAG"