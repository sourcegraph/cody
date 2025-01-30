#!/usr/bin/env bash
# Run this script to push a tag that will trigger CI to publish a new release.
set -eu

usage() {
  echo "Usage: $0 --major|--minor|--patch [ --nightly|--experimental ] [ --dry-run ]"
  exit 1
}

execute() {
  if [ -z "$DRY_RUN" ]; then
    "$@"
  else
    echo "DRY RUN: $*"
  fi
}

# Check if the working tree is clean
if ! git diff-index --quiet HEAD --; then
  echo "Error: Your working tree is not clean. Please commit or stash your changes."
  exit 1
fi

VERSION_INCREMENT=""
CHANNEL=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --major|--minor|--patch)
      VERSION_INCREMENT="$1"
      shift
      ;;
    --nightly|--experimental)
      CHANNEL="${1:1}" # Trim one of the leading -s to make a version suffix like -nightly.
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
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
echo Fetching git tags to compute next version...
git fetch origin +refs/tags/jb-v*:refs/tags/jb-v*

MERGE_BASE=$(git merge-base HEAD origin/main)
echo "Your current commit:"
git show -s --format=oneline HEAD
echo "Your branch base:"
git show -s --format=oneline "$MERGE_BASE"
echo "Other releases from this branch:"
git tag --list 'jb-v*' --contains "$MERGE_BASE"

# shellcheck disable=SC2162
read -p "Are you sure you want to proceed? (y/N): " proceed
if [ "$proceed" != "y" ]; then
  echo "Aborted."
  exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
SCRIPT_DIR="$(readlink -f "$SCRIPT_DIR")"
NEXT_VERSION="$(bash "$SCRIPT_DIR/next-release.sh" $VERSION_INCREMENT "$MERGE_BASE")"

# Check the argument and take appropriate action
if [ "$VERSION_INCREMENT" == "--major" ]; then
  read -p "[WARNING] Upgrade of the major version in a special event, do you want to proceed? (y/N): " choice
  if [ "$choice" != "y" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# shellcheck disable=SC2162
read -p "Confirm that you want to ${DRY_RUN:+"DRY "}run the release v$NEXT_VERSION$CHANNEL (y/N): " choice
if [ "$choice" == "y" ]; then
  echo "Running release..."
else
  echo "Aborted."
  exit 1
fi

execute bash "$SCRIPT_DIR/verify-release.sh"
TAG="jb-v$NEXT_VERSION$CHANNEL"
echo "$TAG"

execute git tag -a "$TAG" -m "$TAG" && execute git push origin "$TAG"
