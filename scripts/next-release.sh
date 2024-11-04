#!/usr/bin/env bash
set -eu

# Check the number of arguments
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 [--major | --minor | --patch]"
  exit 1
fi

LAST_MAJOR_MINOR_ZERO_RELEASE=$(git tag -l | grep "v\d*\\.\d*\\.\d*" | uniq | sort -V | tail -1 | sed 's/-nightly//' | sed 's/-experimental//')
MAJOR=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | sed 's/v//' | cut -d. -f1)
MINOR=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | sed 's/v//' | cut -d. -f2)
PATCH=$(echo $LAST_MAJOR_MINOR_ZERO_RELEASE | sed 's/v//' | cut -d. -f3)

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
