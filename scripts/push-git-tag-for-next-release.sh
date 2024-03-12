#!/usr/bin/env bash
# Run this script to cut a new nightly release.
# No arguments needed, the version is automatically computed.
set -eux

# Check the number of arguments
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 [--major | --minor | --path]"
  exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
SCRIPT_DIR="$(readlink -f "$SCRIPT_DIR")"
NEXT_RELEASE_ARG="$1"
NEXT_VERSION="$(bash "$SCRIPT_DIR/next-release.sh" $NEXT_RELEASE_ARG)"

# Check the argument and take appropriate action
if [ "$NEXT_RELEASE_ARG" == "--major" ]; then
  read -p "[WARNING] Upgrade of the major version in a special event, do you want to proceed? (y/n): " choice
  if [ "$choice" != "y" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# shellcheck disable=SC2162
read -p "Confirm that you want to run the release v.$NEXT_VERSION (y/n): " choice
if [ "$choice" == "y" ]; then
  echo "Running release..."
else
  echo "Aborted."
  exit 1
fi

bash "$SCRIPT_DIR/verify-release.sh"
TAG="v$NEXT_VERSION"
echo "$TAG"
git tag -fa "$TAG" -m "$TAG" && git push -f origin "$TAG"