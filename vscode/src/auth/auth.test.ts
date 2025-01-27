import {
    type AuthStatus,
    CLIENT_CAPABILITIES_FIXTURE,
    SourcegraphGraphQLAPIClient,
    mockAuthStatus,
    mockClientCapabilities,
    mockResolvedConfig,
} from '@sourcegraph/cody-shared'
import {
    AvailabilityError,
    InvalidAccessTokenError,
    NeedsAuthChallengeError,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type MockInstance, vi } from 'vitest'
import type * as vscode from 'vscode'
import * as AuthProviderModule from '../services/AuthProvider'
import { mockLocalStorage } from '../services/LocalStorageProvider'
import { vsCodeMocks } from '../testutils/mocks'
import { showSignInMenu, validateCredentials } from './auth'

describe('showSignInMenu', () => {
    beforeAll(() => {
        mockResolvedConfig({
            configuration: { serverEndpoint: 'https://example.com', overrideAuthToken: 'x' },
            auth: { serverEndpoint: 'https://example.com' },
        })
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockAuthStatus({ authenticated: false })
        mockLocalStorage('noop')
        vi.spyOn<typeof vscode.window, 'showQuickPick'>(
            vsCodeMocks.window as unknown as typeof vscode.window,
            'showQuickPick'
        ).mockImplementation(async () => ({ id: '1', label: 'l', uri: 'https://example.com' }))
    })

    it('does not show access token input box when authentication fails with availability error', async () => {
        vi.spyOn(AuthProviderModule, 'authProvider', 'get').mockReturnValue({
            validateAndStoreCredentials: vi
                .fn<(typeof AuthProviderModule.authProvider)['validateAndStoreCredentials']>()
                .mockResolvedValue({
                    authenticated: false,
                    error: new AvailabilityError(),
                    endpoint: 'https://example.com',
                    pendingValidation: false,
                }),
        } satisfies Pick<
            typeof AuthProviderModule.authProvider,
            'validateAndStoreCredentials'
        > as unknown as typeof AuthProviderModule.authProvider)
        const mockShowInputBox = vi.spyOn<typeof vscode.window, 'showInputBox'>(
            vsCodeMocks.window as unknown as typeof vscode.window,
            'showInputBox'
        )
        const mockShowErrorMessage = vi.spyOn<typeof vscode.window, 'showErrorMessage'>(
            vsCodeMocks.window as unknown as typeof vscode.window,
            'showErrorMessage'
        )

        await showSignInMenu()
        expect(mockShowInputBox).not.toHaveBeenCalled()
        expect(mockShowErrorMessage).toHaveBeenCalledWith('Sourcegraph is unreachable')
    })

    it('shows access token input box when authentication fails with invalid access token error', async () => {
        vi.spyOn(AuthProviderModule, 'authProvider', 'get').mockReturnValue({
            validateAndStoreCredentials: vi
                .fn<(typeof AuthProviderModule.authProvider)['validateAndStoreCredentials']>()
                .mockResolvedValue({
                    authenticated: false,
                    error: new InvalidAccessTokenError(),
                    endpoint: 'https://example.com',
                    pendingValidation: false,
                }),
        } satisfies Pick<
            typeof AuthProviderModule.authProvider,
            'validateAndStoreCredentials'
        > as unknown as typeof AuthProviderModule.authProvider)
        const mockShowInputBox = vi
            .spyOn<typeof vscode.window, 'showInputBox'>(
                vsCodeMocks.window as unknown as typeof vscode.window,
                'showInputBox'
            )
            .mockResolvedValue('my-token')
        const mockShowErrorMessage = vi.spyOn<typeof vscode.window, 'showErrorMessage'>(
            vsCodeMocks.window as unknown as typeof vscode.window,
            'showErrorMessage'
        )

        await showSignInMenu()
        expect(mockShowInputBox).toHaveBeenCalled()
        expect(mockShowErrorMessage).toHaveBeenCalledWith('The access token is invalid or has expired')
    })
})

describe('validateCredentials', () => {
    let getCurrentUserInfoSpy: MockInstance
    beforeEach(() => {
        getCurrentUserInfoSpy = vi.spyOn(SourcegraphGraphQLAPIClient.prototype, 'getCurrentUserInfo')
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('returns unauthenticated status when NeedsAuthChallengeError occurs', async () => {
        getCurrentUserInfoSpy.mockResolvedValue(new NeedsAuthChallengeError())

        const result = await validateCredentials({
            auth: {
                serverEndpoint: 'https://sourcegraph.test',
                credentials: { token: 'test-token' },
            },
            configuration: {
                customHeaders: {},
            },
            clientState: {
                anonymousUserID: 'test-user',
            },
        })

        expect(result).toEqual<AuthStatus>({
            authenticated: false,
            error: new NeedsAuthChallengeError(),
            endpoint: 'https://sourcegraph.test',
            pendingValidation: false,
        })
    })
})
