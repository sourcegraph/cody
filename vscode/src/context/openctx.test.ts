import {
    type AuthStatus,
    CLIENT_CAPABILITIES_FIXTURE,
    DOTCOM_URL,
    GIT_OPENCTX_PROVIDER_URI,
    WEB_PROVIDER_URI,
    featureFlagProvider,
    firstValueFrom,
    graphqlClient,
    mockClientCapabilities,
    mockResolvedConfig,
} from '@sourcegraph/cody-shared'
import { dummyClientConfigForTest } from '@sourcegraph/cody-shared/src/sourcegraph-api/clientConfig'
import { Observable } from 'observable-fns'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { getOpenCtxProviders } from './openctx'
import RemoteDirectoryProvider from './openctx/remoteDirectorySearch'
import RemoteFileProvider from './openctx/remoteFileSearch'
import RemoteRepositorySearch from './openctx/remoteRepositorySearch'

vi.mock('../../../lib/shared/src/experimentation')

describe('getOpenCtxProviders', () => {
    beforeAll(() => {
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockResolvedConfig({
            configuration: { experimentalNoodle: false },
            auth: { serverEndpoint: 'https://example.com' },
        })
    })

    const mockAuthStatus = (
        isDotCom: boolean,
        authenticated = true
    ): Observable<Pick<AuthStatus, 'endpoint' | 'authenticated'>> => {
        return Observable.of({
            endpoint: isDotCom ? DOTCOM_URL.toString() : 'https://example.com',
            authenticated,
        })
    }

    const mockClientConfig = Observable.of(dummyClientConfigForTest)

    test('dotcom user', async () => {
        vi.spyOn(featureFlagProvider, 'evaluateFeatureFlag').mockReturnValue(Observable.of(false))
        vi.spyOn(graphqlClient, 'isValidSiteVersion').mockReturnValue(Promise.resolve(true))

        const providers = await firstValueFrom(
            getOpenCtxProviders(mockAuthStatus(true), mockClientConfig)
        )

        expect(providers.map(p => p.providerUri)).toEqual([WEB_PROVIDER_URI])
    })

    test('enterprise user', async () => {
        vi.spyOn(featureFlagProvider, 'evaluateFeatureFlag').mockReturnValue(Observable.of(false))
        vi.spyOn(graphqlClient, 'isValidSiteVersion').mockReturnValue(Promise.resolve(true))

        const providers = await firstValueFrom(
            getOpenCtxProviders(mockAuthStatus(false), mockClientConfig)
        )

        expect(providers.map(p => p.providerUri)).toEqual([
            WEB_PROVIDER_URI,
            RemoteRepositorySearch.providerUri,
            RemoteDirectoryProvider.providerUri,
            RemoteFileProvider.providerUri,
        ])
    })

    test('should include gitMentionsProvider when feature flag is true', async () => {
        vi.spyOn(featureFlagProvider, 'evaluateFeatureFlag').mockReturnValue(Observable.of(true))
        vi.spyOn(graphqlClient, 'isValidSiteVersion').mockReturnValue(Promise.resolve(true))

        const providers = await firstValueFrom(
            getOpenCtxProviders(mockAuthStatus(false), mockClientConfig)
        )

        expect(providers.map(p => p.providerUri)).toContain(GIT_OPENCTX_PROVIDER_URI)
    })
})
