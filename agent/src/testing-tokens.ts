import { DOTCOM_URL } from '@sourcegraph/cody-shared'

export interface TestingToken {
    readonly production?: string
    readonly redacted: string
    readonly serverEndpoint: string
}

export const TESTING_TOKENS = {
    dotcom: {
        production: process.env.SRC_ACCESS_TOKEN,
        redacted: 'REDACTED_b09f01644a4261b32aa2ee4aea4f279ba69a57cff389f9b119b5265e913c0ea4',
        serverEndpoint: DOTCOM_URL.toString(),
    } satisfies TestingToken,
    dotcomProUserRateLimited: {
        production: process.env.SRC_ACCESS_TOKEN_WITH_RATE_LIMIT,
        redacted: 'REDACTED_8c77b24d9f3d0e679509263c553887f2887d67d33c4e3544039c1889484644f5',
        serverEndpoint: DOTCOM_URL.toString(),
    } satisfies TestingToken,
    enterprise: {
        production: process.env.SRC_ENTERPRISE_ACCESS_TOKEN,
        redacted: 'REDACTED_b20717265e7ab1d132874d8ff0be053ab9c1dacccec8dce0bbba76888b6a0a69',
        serverEndpoint: 'https://demo.sourcegraph.com/',
    } satisfies TestingToken,
    s2: {
        production: process.env.SRC_S2_ACCESS_TOKEN,
        redacted: 'REDACTED_ad28238383af71357085701263df7766e6f7f8ad1afc344d71aaf69a07143677',
        serverEndpoint: 'https://sourcegraph.sourcegraph.com/',
    } satisfies TestingToken,
}
