#!/bin/bash
# Run this script to fix git conflicts in HTTP recording files. This script
# resolves conflicts by picking "theirs", which is usually the recordings in the
# main branch.  After running this script, run `pnpm update-agent-recordings` to
# re-record the changes from your branch.
set -eux

git checkout --theirs agent/recordings/*/recording.har.yaml
