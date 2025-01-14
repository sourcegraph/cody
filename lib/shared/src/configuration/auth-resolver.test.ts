import { describe, expect, test } from 'vitest'
import { type HeaderCredential, type TokenSource, isWindows } from '..'
import { resolveAuth } from './auth-resolver'
import type { ClientSecrets } from './resolver'

class TempClientSecrets implements ClientSecrets {
    constructor(readonly store: Map<string, [string, TokenSource]>) {}

    getToken(endpoint: string): Promise<string | undefined> {
        return Promise.resolve(this.store.get(endpoint)?.[0])
    }
    getTokenSource(endpoint: string): Promise<TokenSource | undefined> {
        return Promise.resolve(this.store.get(endpoint)?.[1])
    }
}

describe('auth-resolver', () => {
    test('resolve with serverEndpoint and credentials overrides', async () => {
        const auth = await resolveAuth(
            'sourcegraph.com',
            {
                authExternalProviders: [],
                overrideServerEndpoint: 'my-endpoint.com',
                overrideAuthToken: 'my-token',
            },
            new TempClientSecrets(new Map([['sourcegraph.com/', ['sgp_212323123', 'paste']]]))
        )

        expect(auth.serverEndpoint).toBe('my-endpoint.com/')
        expect(auth.credentials).toEqual({ token: 'my-token' })
    })

    test('resolve with serverEndpoint override', async () => {
        const auth = await resolveAuth(
            'sourcegraph.com',
            {
                authExternalProviders: [],
                overrideServerEndpoint: 'my-endpoint.com',
                overrideAuthToken: undefined,
            },
            new TempClientSecrets(new Map([['my-endpoint.com/', ['sgp_212323123', 'paste']]]))
        )

        expect(auth.serverEndpoint).toBe('my-endpoint.com/')
        expect(auth.credentials).toEqual({ token: 'sgp_212323123', source: 'paste' })
    })

    test('resolve with token override', async () => {
        const auth = await resolveAuth(
            'sourcegraph.com',
            {
                authExternalProviders: [],
                overrideServerEndpoint: undefined,
                overrideAuthToken: 'my-token',
            },
            new TempClientSecrets(new Map([['sourcegraph.com/', ['sgp_777777777', 'paste']]]))
        )

        expect(auth.serverEndpoint).toBe('sourcegraph.com/')
        expect(auth.credentials).toEqual({ token: 'my-token' })
    })

    test('resolve custom auth provider', async () => {
        const credentialsJson = JSON.stringify({
            headers: { Authorization: 'token X' },
            expiration: 1337,
        })

        const auth = await resolveAuth(
            'sourcegraph.com',
            {
                authExternalProviders: [
                    {
                        endpoint: 'https://my-server.com',
                        executable: {
                            commandLine: [
                                isWindows() ? `echo ${credentialsJson}` : `echo '${credentialsJson}'`,
                            ],
                            shell: isWindows() ? process.env.ComSpec : '/bin/bash',
                            timeout: 5000,
                            windowsHide: true,
                        },
                    },
                ],
                overrideServerEndpoint: 'https://my-server.com',
                overrideAuthToken: undefined,
            },
            new TempClientSecrets(new Map())
        )

        expect(auth.serverEndpoint).toBe('https://my-server.com/')

        const headerCredential = auth.credentials as HeaderCredential
        expect(headerCredential.expiration).toBe(1337)
        expect(headerCredential.getHeaders()).toStrictEqual({
            Authorization: 'token X',
        })

        expect(JSON.stringify(headerCredential)).not.toContain('token X')
    })
})
