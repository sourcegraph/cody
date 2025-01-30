#!/usr/bin/env bash
# Run this script to cut a new release.
# No arguments needed, the version is automatically computed.
set -eux

usage() {
  echo "Usage: $0 --major|--minor|--patch [ --nightly|--experimental ] [ --dry-run ]"
  exit 1
}

execute() {
  if [ "$DRY_RUN" -eq 0 ]; then
    echo "DRY RUN: $*"
  else
    "$@"
  fi
}

# Check if the current branch is 'main'
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Warning: You are not on the 'main' branch. You are on '$CURRENT_BRANCH'."
  # shellcheck disable=SC2162
  read -p "Are you sure you want to proceed? (y/N): " proceed
  if [ "$proceed" != "y" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# Check if the working tree is clean
if ! git diff-index --quiet HEAD --; then
  echo "Error: Your working tree is not clean. Please commit or stash your changes."
  exit 1
fi

VERSION_INCREMENT=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --major|--minor|--patch)
      VERSION_INCREMENT="$1"
      shift
      ;;
    --nightly|--experimental)
      CHANNEL="$1"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# Check one of --major, --minor or --patch was specified.
if [ -z "$VERSION_INCREMENT" ]; then
  usage
fi

# Fetch git tags so we can compute an accurate next version.
git fetch origin +refs/tags/jb-v*:refs/tags/jb-v*

SCRIPT_DIR="$(dirname "$0")"
SCRIPT_DIR="$(readlink -f "$SCRIPT_DIR")"
NEXT_VERSION="$(bash "$SCRIPT_DIR/next-release.sh" $VERSION_INCREMENT)"

# Check the argument and take appropriate action
if [ "$VERSION_INCREMENT" == "--major" ]; then
  read -p "[WARNING] Upgrade of the major version in a special event, do you want to proceed? (y/N): " choice
  if [ "$choice" != "y" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# shellcheck disable=SC2162
read -p "Confirm that you want to run the release v$NEXT_VERSION-$CHANNEL (y/N): " choice
if [ "$choice" == "y" ]; then
  echo "Running release..."
else
  echo "Aborted."
  exit 1
fi

execute bash "$SCRIPT_DIR/verify-release.sh"
TAG="jb-v$NEXT_VERSION-$CHANNEL"
echo "$TAG"

execute git tag -a "$TAG" -m "$TAG" && execute git push origin "$TAG"
