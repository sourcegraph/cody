# This is a PowerShell version of export-cody-http-recording-tokens.sh

$Env:SRC_DOTCOM_PRO_ACCESS_TOKEN = & gcloud secrets versions access latest --secret CODY_PRO_ACCESS_TOKEN --project cody-agent-tokens --quiet
$Env:SRC_ENTERPRISE_ACCESS_TOKEN = & gcloud secrets versions access latest --secret CODY_ENTERPRISE_ACCESS_TOKEN --project cody-agent-tokens --quiet
$Env:SRC_S2_ACCESS_TOKEN = & gcloud secrets versions access latest --secret CODY_S2_ACCESS_TOKEN --project cody-agent-tokens --quiet
$Env:SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN = & gcloud secrets versions access latest --secret CODY_PRO_RATE_LIMITED_ACCESS_TOKEN --project cody-agent-tokens --quiet
$Env:SRC_ACCESS_TOKEN_FREE_USER_WITH_RATE_LIMIT = & gcloud secrets versions access latest --secret CODY_FREE_RATE_LIMITED_ACCESS_TOKEN --project cody-agent-tokens --quiet
$Env:SRC_ENDPOINT='https://sourcegraph.com'
