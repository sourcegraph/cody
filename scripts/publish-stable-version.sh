#!/usr/bin/env bash
set -eux
VERSION="$1"
./gradlew clean || ./gradlew clean
./gradlew "-PpluginVersion=$VERSION-nightly" -PforceBuild=true publishPlugin
./gradlew "-PpluginVersion=$VERSION" publishPlugin