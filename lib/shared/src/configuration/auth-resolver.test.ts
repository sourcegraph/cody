//@ts-nocheck
import { describe, expect, test } from 'vitest'
import { type TokenSource, isWindows } from '..'
import { resolveAuth } from './auth-resolver'
import type { ClientSecrets } from './resolver'

class TempClientSecrets implements ClientSecrets {
    constructor(readonly store: Map<string, [string, TokenSource]>) {}

    getToken(endpoint: string): Promise<string | undefined> {
        return Promise.resolve(this.store.get(endpoint)?.at(0))
    }
    getTokenSource(endpoint: string): Promise<TokenSource | undefined> {
        return Promise.resolve(this.store.get(endpoint)?.at(1))
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
        const auth = await resolveAuth(
            'sourcegraph.com',
            {
                authExternalProviders: [
                    {
                        endpoint: 'my-server.com',
                        executable: {
                            commandLine: [
                                'echo \'{ "headers": { "Authorization": "token X" }, "expiration": 2222222222 }\'',
                            ],
                            shell: isWindows || '/bin/bash',
                            timeout: 5000,
                            windowsHide: true,
                        },
                    },
                ],
                overrideServerEndpoint: 'my-server.com',
                overrideAuthToken: undefined,
            },
            new TempClientSecrets(new Map())
        )

        expect(auth.serverEndpoint).toBe('my-server.com/')

        const headerCredential = auth.credentials as HeaderCredential
        expect(headerCredential.expiration).toBe(2222222222)
        expect(headerCredential.getHeaders()).toStrictEqual({
            Authorization: 'token X',
        })

        expect(JSON.stringify(headerCredential)).not.toContain('token X')
    })
})
