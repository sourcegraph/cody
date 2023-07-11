#!/usr/bin/env bash

VERSION="v13.0.0-8"

# get first command line arg if it exists
if [ -n "$1" ]; then
  FILTER="$1"
fi

run() {
  RIPGREP_DIR="$(dirname "$(readlink -f "$0")")/../resources/bin"
  mkdir -p "${RIPGREP_DIR}"
  pushd "${RIPGREP_DIR}" > /dev/null || return
  trap 'popd' EXIT

  for url in $(curl https://api.github.com/repos/microsoft/ripgrep-prebuilt/releases/tags/$VERSION 2>/dev/null | jq -r '.assets[] | .browser_download_url'); do
    # skip obscure platforms
    if [[ "$url" == *"powerpc64le"* ]] || [[ "$url" == *"s390x"* ]] || [[ "$url" == *"i686"* ]]; then
      continue
    fi

    # filter out files that don't match the filter
    if [ -n "$FILTER" ] && [[ "$url" != *"$FILTER"* ]]; then
      continue
    fi

    b=$(basename "$url")
    ext=${b##*.}

    if [ "$ext" = "gz" ]; then
      stripped=${b%.tar.gz}

      if [ ! -f "$stripped" ]; then
        echo "$url -> $stripped"
        wget -qO- "$url" | tar xvz -C ./ && mv ./rg "./$stripped"
      fi

    elif [ "$ext" = "zip" ]; then
      stripped=${b%.zip}

      if [ ! -f "$stripped" ]; then
        echo "$url -> $stripped"
        wget -q "$url"
        unzip -q "$b"
        mv "rg.exe" "./$stripped"
        rm "$b"
      fi

    else
      echo "ERROR: unrecognized extension $ext"
    fi

  done
}

run
