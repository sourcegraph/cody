#!/usr/bin/env bash
#
# The purpose of this script is to export access tokens forcody-bench
# Usage:
#   cd CODY_DIRECTORY
#   agent/scripts/export-cody-bench-vars.sh dotcom

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SOURCE}/export-cody-http-recording-tokens.sh"

case $1 in
"dotcom")
  export SRC_ACCESS_TOKEN="${SRC_DOTCOM_PRO_ACCESS_TOKEN}"
  ;;
"enterprise")
  export SRC_ACCESS_TOKEN="${SRC_ENTERPRISE_ACCESS_TOKEN}"
  ;;
"s2")
  export SRC_ACCESS_TOKEN="${SRC_S2_ACCESS_TOKEN}"
  ;;
"dotcom-rate-limited")
  export SRC_ACCESS_TOKEN="${SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN}"
  ;;
"free-rate-limited")
  export SRC_ACCESS_TOKEN="${SRC_ACCESS_TOKEN_FREE_USER_WITH_RATE_LIMIT}"
  ;;
*)
  echo "Invalid option. Please specify 'dotcom', 'enterprise', 's2', 'dotcom-rate-limited', or 'free-rate-limited'."
  ;;
esac
