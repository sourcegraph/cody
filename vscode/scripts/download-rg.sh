#!/usr/bin/env bash

set -eu

# Define the desired version and binaries from
# https://github.com/microsoft/ripgrep-prebuilt/releases.
rg_version="13.0.0-8"
binaries=(
ripgrep-v$rg_version-aarch64-apple-darwin
ripgrep-v$rg_version-aarch64-pc-windows-msvc
ripgrep-v$rg_version-aarch64-unknown-linux-gnu
ripgrep-v$rg_version-aarch64-unknown-linux-musl
ripgrep-v$rg_version-arm-unknown-linux-gnueabihf
ripgrep-v$rg_version-x86_64-apple-darwin
ripgrep-v$rg_version-x86_64-pc-windows-msvc
ripgrep-v$rg_version-x86_64-unknown-linux-musl
)

RIPGREP_DIR="$(dirname "$(readlink -f "$0")")/../resources/bin"
mkdir -p "${RIPGREP_DIR}"
pushd "${RIPGREP_DIR}" > /dev/null || return
trap 'popd > /dev/null' EXIT

for bin in ${binaries[@]}; do
  if [[ "$bin" == *"windows"* ]]; then
    ext=".zip"
  else
    ext=".tar.gz"
  fi

  filename="${bin}${ext}"
  url="https://github.com/microsoft/ripgrep-prebuilt/releases/download/v${rg_version}/${filename}"

  if [ "$ext" = ".tar.gz" ]; then
    if [ ! -f "$bin" ]; then
      echo "$url -> $bin"
      curl -sSL $url | tar xvz -C ./ && mv rg $bin
    fi
  elif [ "$ext" = ".zip" ]; then
    if [ ! -f "$bin" ]; then
      echo "$url -> $bin"
      curl -sSL -o $filename $url
      unzip -q $filename
      rm $filename
      mv rg.exe $bin
    fi
  else
    echo "ERROR: unable to handle binary $bin"
  fi
done
