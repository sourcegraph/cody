import { execSync } from 'node:child_process'
import { DOTCOM_URL } from '@sourcegraph/cody-shared'

export interface TestingCredentials {
    readonly token?: string
    readonly redactedToken?: string
    readonly serverEndpoint: string
}

function loadSecret(name: string): string {
    return execSync(
        `gcloud secrets versions access latest --secret ${name} --project cody-agent-tokens --quiet`
    )
        .toString()
        .trim()
}

export function dotcomCredentials(): TestingCredentials {
    return {
        redactedToken: DOTCOM_TESTING_CREDENTIALS.dotcom.redactedToken,
        serverEndpoint: 'https://sourcegraph.com/',
        token: loadSecret('CODY_PRO_ACCESS_TOKEN'),
    }
}

// See instructions in agent/scripts/export-cody-http-recording-tokens.sh for
// how to update the `redacted` tokens when the access token changes.
export const DOTCOM_TESTING_CREDENTIALS = {
    dotcom: {
        token: process.env.SRC_DOTCOM_PRO_ACCESS_TOKEN,
        redactedToken: 'REDACTED_fc324d3667e841181b0779375f26dedc911d26b303d23b29b1a2d7ee63dc77eb',
        serverEndpoint: DOTCOM_URL.toString(),
    } satisfies TestingCredentials,
    dotcomProUserRateLimited: {
        token: process.env.SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN,
        redactedToken: 'REDACTED_c31e1e5cbed2b06911f09e4e9766c7df227fb23b80cb364c1fe289a845667b4e',
        serverEndpoint: DOTCOM_URL.toString(),
    } satisfies TestingCredentials,
    dotcomUnauthed: {
        token: undefined,
        redactedToken: undefined,
        serverEndpoint: DOTCOM_URL.toString(),
    } satisfies TestingCredentials,
}

export const ENTERPRISE_TESTING_CREDENTIALS = {
    enterprise: {
        token: process.env.SRC_ENTERPRISE_ACCESS_TOKEN,
        redactedToken: 'REDACTED_69e9f79ce29352d014eeb80b56510341844eb82ad9abac7cab3631c7e873e4ce',
        serverEndpoint: 'https://demo.sourcegraph.com/',
    } satisfies TestingCredentials,
    s2: {
        token: process.env.SRC_S2_ACCESS_TOKEN,
        redactedToken: 'REDACTED_1858aad0e1ff07ae26d4042086acb9da455866ad617afd2cb9ab9419e1be1104',
        serverEndpoint: 'https://sourcegraph.sourcegraph.com/',
    } satisfies TestingCredentials,
    s2Unauthed: {
        token: undefined,
        redactedToken: undefined,
        serverEndpoint: 'https://sourcegraph.sourcegraph.com/',
    } satisfies TestingCredentials,
}

export const TESTING_CREDENTIALS: typeof ENTERPRISE_TESTING_CREDENTIALS &
    typeof DOTCOM_TESTING_CREDENTIALS = {
    ...DOTCOM_TESTING_CREDENTIALS,
    ...ENTERPRISE_TESTING_CREDENTIALS,
}
