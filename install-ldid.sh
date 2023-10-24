#!/usr/bin/env bash

# Script to install `ldid2` on Linux computers to codesign the macos-arm64 binary for the agent.

set -eux

# Check if ldid is installed
if command -v ldid &>/dev/null; then
  echo "ldid is already installed."
  exit 0
fi

curl -Lo ldid.zip https://github.com/xerub/ldid/archive/refs/heads/master.zip
unzip ldid.zip
cd ldid-master
./make.sh
cp ldid /usr/local/bin/
