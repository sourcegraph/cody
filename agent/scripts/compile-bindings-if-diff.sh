#!/bin/bash
set -eux
git fetch origin main
REVISION="${GITHUB_BASE_REF:-origin/main}"
if [ $(git diff --name-only "HEAD..$REVISION" agent/bindings/kotlin | wc -l) -gt 0 ]; then
  cd agent/bindings/kotlin
  ./gradlew compileKotlin
fi
