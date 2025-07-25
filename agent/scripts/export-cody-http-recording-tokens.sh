#!/usr/bin/env sh
#
# The purpose of this script is to export access tokens for testing purposes in the Cody repository.
# Usage:
#   cd CODY_DIRECTORY
#   source agent/scripts/export-cody-http-recording-tokens.sh
#   pnpm update-agent-recordings
#   pnpm update-rewrite-recordings
#
# If you change this script, please also update export-cody-http-recording-tokens.ps1
#
# Tips to update these secrets:
#  - Use 1Password to find account passwords
#  - Use no expiration dates when creating access tokens
#  - You need to update the REDACTED_ access token in agent/src/testing-credentials.ts.
#    To obtain them you need to re-record tests with the new token first.
#    Then you can find redacted tokens in the recording files or generate them using the following command:
#
#    env | grep '^SRC_' | while IFS='=' read -r name value; do echo "$name=REDACTED_$(echo -n "prefix$value" | sha256sum)"; done

export SRC_ENTERPRISE_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_ENTERPRISE_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

export SRC_S2_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_S2_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

# Tests run against demo by default.
export SRC_ENDPOINT=https://demo.sourcegraph.com
