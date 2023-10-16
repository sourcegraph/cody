#!/usr/bin/env bash
set -eu
VERSION="$(git describe --tags | sed 's/^v//')"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-nightly)?$  ]]; then
  echo "Version $VERSION does not match semver pattern MAJOR.MINOR.PATCH where each part is a number"
  echo "To fix this problem, make sure you are running this script with a non-dirty work tree and that HEAD points to a commit that has an associated git tag using the format vMAJOR.MINOR.PATCH"
  exit 1
fi
echo $VERSION