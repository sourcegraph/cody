#!/usr/bin/env bash
# Run this script to cut a new nightly release.
# No arguments needed, the version is automatically computed.
set -eux

SCRIPT_DIR="$(dirname "$0")"
SCRIPT_DIR="$(readlink -f $SCRIPT_DIR)"
NEXT_VERSION="$(bash "$SCRIPT_DIR/next-release.sh")"
bash "$SCRIPT_DIR/verify-release.sh"
TAG="v$NEXT_VERSION"
echo $TAG
git tag -fa "$TAG" -m $TAG && git push -f origin $TAG