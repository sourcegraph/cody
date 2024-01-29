#!/usr/bin/env sh
#
# The purpose of this script is to export access tokens for testing purposes in the Cody repository.
# Usage:
#   cd CODY_DIRECTORY
#   source agent/scripts/export-cody-http-recording-tokens.sh
#   pnpm update-agent-recordings
#   pnpm update-symf-recordings
#

# This is a token for a username+password account that was created by
# @olafurpg. Ideally, we can change this account to a dedicated Cody testing
# account in the future. This account has fairly large quotas.
export SRC_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_PRO_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

export SRC_ENTERPRISE_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_ENTERPRISE_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

export SRC_S2_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret CODY_S2_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

# This is a token for a Cody Pro account with rate limits.
export SRC_ACCESS_TOKEN_WITH_RATE_LIMIT="$(gcloud secrets versions access latest --secret CODY_PRO_RATE_LIMITED_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

# This is a token for a Cody Free account that is rate limited.
export SRC_ACCESS_TOKEN_FREE_USER_WITH_RATE_LIMIT="$(gcloud secrets versions access latest --secret CODY_FREE_RATE_LIMITED_ACCESS_TOKEN --project cody-agent-tokens --quiet)"

# Tests run against dotcom by default.
export SRC_ENDPOINT=https://sourcegraph.com
