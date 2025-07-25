export interface TestingCredentials {
    readonly token?: string
    readonly redactedToken?: string
    readonly serverEndpoint: string
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

export const TESTING_CREDENTIALS: typeof ENTERPRISE_TESTING_CREDENTIALS = {
    ...ENTERPRISE_TESTING_CREDENTIALS,
}
