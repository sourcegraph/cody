#!/usr/bin/env sh
set -eux
# The purpose of this script is to record an mp4 video of the Cody cli in action.

if ! command -v vhs &>/dev/null; then
    echo "xsv could not be found, installing..."
    brew install vhs
fi

# Make sure we're at the root of the repository
ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"
vhs agent/demo/demo.vhs

open agent/demo/demo.mp4
