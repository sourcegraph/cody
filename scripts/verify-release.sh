#!/usr/bin/env bash
set -eu

echo "====================================================="
echo "= Running automated tests before publishing release ="
echo "====================================================="
set -x
./gradlew clean buildCodeSearchAssets buildPluginAndAssertAgentBinariesExist runPluginVerifier
