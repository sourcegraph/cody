#!/usr/bin/env bash
set -eu

echo "====================================================="
echo "= Running automated tests before publishing release ="
echo "====================================================="
set -x
unset CODY_DIR
./gradlew clean
./gradlew buildPluginAndAssertAgentBinariesExist runPluginVerifier
