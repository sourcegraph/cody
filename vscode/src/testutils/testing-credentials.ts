import { DOTCOM_URL } from '@sourcegraph/cody-shared'

export interface TestingCredentials {
    readonly token?: string
    readonly redactedToken: string
    readonly serverEndpoint: string
}

// See instructions in agent/scripts/export-cody-http-recording-tokens.sh for
// how to update the `redacted` tokens when the access token changes.
export const TESTING_CREDENTIALS = {
    dotcom: {
        token: process.env.SRC_DOTCOM_PRO_ACCESS_TOKEN,
        redactedToken: 'REDACTED_d5e0f0a37c9821e856b923fe14e67a605e3f6c0a517d5a4f46a4e35943ee0f6d',
        serverEndpoint: DOTCOM_URL.toString(),
    } satisfies TestingCredentials,
    dotcomProUserRateLimited: {
        token: process.env.SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN,
        redactedToken: 'REDACTED_8c77b24d9f3d0e679509263c553887f2887d67d33c4e3544039c1889484644f5',
        serverEndpoint: DOTCOM_URL.toString(),
    } satisfies TestingCredentials,
    enterprise: {
        token: process.env.SRC_ENTERPRISE_ACCESS_TOKEN,
        redactedToken: 'REDACTED_b20717265e7ab1d132874d8ff0be053ab9c1dacccec8dce0bbba76888b6a0a69',
        serverEndpoint: 'https://demo.sourcegraph.com/',
    } satisfies TestingCredentials,
    s2: {
        token: process.env.SRC_S2_ACCESS_TOKEN,
        redactedToken: 'REDACTED_964f5256e709a8c5c151a63d8696d5c7ac81604d179405864d88ff48a9232364',
        serverEndpoint: 'https://sourcegraph.sourcegraph.com/',
    } satisfies TestingCredentials,
}
