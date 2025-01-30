#!/usr/bin/env bash
set -eu

# Note: This script requires you to fetch version tags.
# git fetch origin +refs/tags/jb-v*:refs/tags/jb-v*

# Check the number of arguments
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 < --major|--minor|--patch > <git commit for merge base>"
  exit 1
fi

MERGE_BASE="$2"

LAST_MAJOR_MINOR_ZERO_RELEASE=$(git tag -l 'jb-v*' --contains "$MERGE_BASE" | sort -V | tail -1 | sed 's/-nightly//' | sed 's/-experimental//')

if [ -z "$LAST_MAJOR_MINOR_ZERO_RELEASE" ]; then
  # This is a new release branch.
  LAST_MAJOR_MINOR_ZERO_RELEASE=$(git tag -l | grep -E 'jb-v[0-9]+\.[0-9]+\.[0-9]+' | sort -V | tail -1 | sed 's/-nightly//' | sed 's/-experimental//')
fi

MAJOR=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | sed 's/jb-v//' | cut -d. -f1)
MINOR=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | sed 's/jb-v//' | cut -d. -f2)
PATCH=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | sed 's/jb-v//' | cut -d. -f3)

NEXT_RELEASE_ARG="$1"
# Check the argument and take appropriate action
if [ "$NEXT_RELEASE_ARG" == "--major" ]; then
  MAJOR=$(($MAJOR+1))
  echo "$MAJOR.0.0"
elif [ "$NEXT_RELEASE_ARG" == "--minor" ]; then
  MINOR=$((MINOR+1))
  echo "$MAJOR.$MINOR.0"
elif [ "$NEXT_RELEASE_ARG" == "--patch" ]; then
  PATCH=$(($PATCH+1))
  echo "$MAJOR.$MINOR.$PATCH"
else
  echo "Invalid argument. Usage: $0 [--major | --minor | --patch]"
  exit 1
fi
