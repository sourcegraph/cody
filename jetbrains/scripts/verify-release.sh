#!/usr/bin/env bash
set -eu

echo "====================================================="
echo "= Running automated tests before publishing release ="
echo "====================================================="
set -x
unset CODY_DIR
unset SKIP_CODE_SEARCH_BUILD

./gradlew clean || ./gradlew clean # Run it twice because Gradle clean is brittle
./gradlew buildPlugin
./gradlew verifyPlugin
