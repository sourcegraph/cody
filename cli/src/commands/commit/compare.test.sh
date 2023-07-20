#!/bin/bash

set -eu

# Usage: compare.test.sh <REVSPEC>
REVSPEC="${1-HEAD}"
COMMIT_SHA=$(git rev-parse --verify "$REVSPEC^{commit}")

# Create temp file and delete when script exits.
tmpfile=$(mktemp)
trap "rm -f $tmpfile" EXIT

git --no-pager show --no-color --unified=1 --format= $COMMIT_SHA > $tmpfile

# get git commit message
echo '# Actual commit message:'
echo
git --no-pager show --format=format:%B --no-patch $COMMIT_SHA
echo '###############################################################'
echo '# Cody-generated commit message:'
pnpm run --silent start --debug commit --diff-file $tmpfile
