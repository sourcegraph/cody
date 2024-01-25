#!/bin/bash
# Run this script to update the value of all HTTP recording files to have the
# same value as on `origin/main`.  Use this script to ignore merge conflicts in
# HTTP recording files. Instead of merging, just commit the conflict markers,
# continue your rebase/merge, and run this script.
set -eu
default_revision=$(git rev-parse origin/main)
revision=${1:-$default_revision}
for file in $(git ls-files | uniq | grep '.har.yaml'); do
  git show "$revision:$file" > "$file"
done
