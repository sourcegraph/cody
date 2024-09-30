import {
    type AuthStatus,
    CLIENT_CAPABILITIES_FIXTURE,
    DOTCOM_URL,
    GIT_OPENCTX_PROVIDER_URI,
    WEB_PROVIDER_URI,
    featureFlagProvider,
    firstValueFrom,
    mockClientCapabilities,
    mockResolvedConfig,
} from '@sourcegraph/cody-shared'
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

    const mockAuthStatus = (isDotCom: boolean): Observable<Pick<AuthStatus, 'endpoint'>> => {
        return Observable.of({ endpoint: isDotCom ? DOTCOM_URL.toString() : 'https://example.com' })
    }

    test('dotcom user', async () => {
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))

        const providers = await firstValueFrom(getOpenCtxProviders(mockAuthStatus(true), true))

        expect(providers.map(p => p.providerUri)).toEqual([WEB_PROVIDER_URI])
    })

    test('enterprise user', async () => {
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))

        const providers = await firstValueFrom(getOpenCtxProviders(mockAuthStatus(false), true))

        expect(providers.map(p => p.providerUri)).toEqual([
            WEB_PROVIDER_URI,
            RemoteRepositorySearch.providerUri,
            RemoteDirectoryProvider.providerUri,
            RemoteFileProvider.providerUri,
        ])
    })

    test('should include gitMentionsProvider when feature flag is true', async () => {
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(true))

        const providers = await firstValueFrom(getOpenCtxProviders(mockAuthStatus(false), true))

        expect(providers.map(p => p.providerUri)).toContain(GIT_OPENCTX_PROVIDER_URI)
    })
})
