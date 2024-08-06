#!/usr/bin/env sh
#
# The purpose of this script is to export access tokens for testing purposes in the Cody repository.
# Usage:
#   cd CODY_DIRECTORY
#   source agent/scripts/export-cody-http-recording-tokens.sh
#   pnpm update-agent-recordings
#   pnpm update-rewrite-recordings
#
# Tips to update these secrets:
#  - Use 1Password to find account passwords
#  - Use no expiration dates when creating access tokens
#  - You need to update the REDACTED_ access token in
#    agent/src/testing-credentials.ts.  There's no automatic way to do this for now,
#    you need to re-record with the new token, manually copy the updated REDACTED_
#    token from the recording file and paste it into agent/src/testing-tokens.ts.

export SRC_DOTCOM_PRO_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_PRO_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

export SRC_ENTERPRISE_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_ENTERPRISE_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

export SRC_S2_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_S2_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

# This is a token for a Cody Pro account with rate limits.
export SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_PRO_RATE_LIMITED_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

# This is a token for a Cody Free account that is rate limited.
export SRC_ACCESS_TOKEN_FREE_USER_WITH_RATE_LIMIT="$(gcloud secrets versions access latest --secret CODY_FREE_RATE_LIMITED_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

# Tests run against dotcom by default.
export SRC_ENDPOINT=https://sourcegraph.com
