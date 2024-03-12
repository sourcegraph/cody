#!/usr/bin/env bash
# This script implements the time-based version scheme from RFC 795
# Simplified: versions should be MAJOR.MINOR.PATCH where
# - MAJOR.MINOR: Latest Sourcegraph quarterly release
# - PATCH: time-based number from simplified formula (MINUTES_SINCE_LAST_RELEASE / MINUTES_IN_ONE_YEAR * 65535)
# The scheme gives generates a unique version number every 10 minutes.
# https://docs.google.com/document/d/11cw-7dAp93JmasITNSNCtx31xrQsNB1L2OoxVE6zrTc/edit#bookmark=id.ufwe0bqp83z1
set -eu

# Check the number of arguments
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 [--major | --minor | --path]"
  exit 1
fi

if [[ "$(uname)" == "Darwin" ]]; then
  if ! command -v gdate &>/dev/null; then
    echo "Command not found: gdate"
    echo "The command gdate is required to compute the next version number"
    echo "To fix this problem, run:\n  brew install coreutils"
    exit 1
  fi
  date_program() {
    gdate "$@"
  }
else
  if ! command -v date &>/dev/null; then
    echo "Command not found: date"
    exit 1
  fi
  date_program() {
    date "$@"
  }
fi

if ! command -v gh &>/dev/null; then
  echo "Command not found: gh"
  exit 1
fi

LAST_MAJOR_MINOR_ZERO_RELEASE=$(gh release list --repo sourcegraph/jetbrains --limit 20 --exclude-drafts --exclude-pre-releases | sed 's/Latest//' | awk '$2 ~ /v[0-9]+\.[0-9]+\.[0-9]+$/ { print $2, $3; exit }')
MAJOR=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | awk '{ print $1 }' | sed 's/v//' | cut -d. -f1)
MINOR=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | awk '{ print $1 }' | sed 's/v//' | cut -d. -f2)
LAST_RELEASE_TIMESTAMP=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | awk '{ print $2 }')

NEXT_RELEASE_ARG="$1"
# Check the argument and take appropriate action
if [ "$NEXT_RELEASE_ARG" == "--major" ]; then
  MAJOR=$(($MAJOR+1))
  echo "$MAJOR.0.0"
elif [ "$NEXT_RELEASE_ARG" == "--minor" ]; then
  MINOR=$((MINOR+1))
  echo "$MAJOR.$MINOR.0"
elif [ "$NEXT_RELEASE_ARG" == "--patch" ]; then
  # Current year
  MILLIS_START_YEAR="$(date_program -d "$LAST_RELEASE_TIMESTAMP" +%s%3N)"
  MILLIS_NOW="$(date_program +%s%3N)"
  BUILDNUM_MILLIS="$(($MILLIS_NOW - $MILLIS_START_YEAR))"
  MILLIS_IN_ONE_MINUTE=60000
  MINUTES_IN_ONE_YEAR=525600 # assuming 365 days
  MAX_SEMVER_PATCH_NUMBER=65535 # per Microsoft guidelines
  BUILDNUM_MINUTES="$(($BUILDNUM_MILLIS / $MILLIS_IN_ONE_MINUTE))"
  BUILDNUM="$(($BUILDNUM_MINUTES * $MAX_SEMVER_PATCH_NUMBER / $MINUTES_IN_ONE_YEAR ))"
  echo "$MAJOR.$MINOR.$BUILDNUM"
else
  echo "Invalid argument. Usage: $0 [--major | --minor | --path]"
  exit 1
fi
