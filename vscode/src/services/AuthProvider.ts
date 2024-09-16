import * as vscode from 'vscode'

import {
    type AuthStatus,
    ClientConfigSingleton,
    type ClientConfigurationWithAccessToken,
    CodyIDE,
    SourcegraphGraphQLAPIClient,
    currentResolvedConfig,
    graphqlClient,
    isDotCom,
    isError,
    isNetworkLikeError,
    logError,
    setAuthStatusObservable,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { Subject } from 'observable-fns'
import { formatURL } from '../auth/auth'
import { newAuthStatus } from '../chat/utils'
import { getFullConfig } from '../configuration'
import { logDebug } from '../log'
import { maybeStartInteractiveTutorial } from '../tutorial/helpers'
import { localStorage } from './LocalStorageProvider'
import { secretStorage } from './SecretStorageProvider'

const HAS_AUTHENTICATED_BEFORE_KEY = 'has-authenticated-before'

export class AuthProvider implements vscode.Disposable {
    private client: SourcegraphGraphQLAPIClient | null = null
    private status = new Subject<AuthStatus>()

    constructor() {
        setAuthStatusObservable(this.status)
    }

    public dispose(): void {}

    // Sign into the last endpoint the user was signed into, if any
    public async init(): Promise<void> {
        const { auth } = await currentResolvedConfig()
        const lastEndpoint = localStorage?.getEndpoint() || auth.serverEndpoint
        const token = (await secretStorage.get(lastEndpoint || '')) || auth.accessToken
        logDebug(
            'AuthProvider:init:lastEndpoint',
            token?.trim() ? 'Token recovered from secretStorage' : 'No token found in secretStorage',
            lastEndpoint
        )

        await this.auth({
            endpoint: lastEndpoint,
            token: token || null,
            isExtensionStartup: true,
        }).catch(error => logError('AuthProvider:init:failed', lastEndpoint, { verbose: error }))
    }

    // Create Auth Status
    private async makeAuthStatus(
        config: Pick<
            ClientConfigurationWithAccessToken,
            'serverEndpoint' | 'accessToken' | 'customHeaders'
        >,
        isOfflineMode?: boolean
    ): Promise<AuthStatus> {
        const endpoint = config.serverEndpoint
        const token = config.accessToken
        const isCodyWeb =
            vscode.workspace.getConfiguration().get<string>('cody.advanced.agent.ide') === CodyIDE.Web

        if (isOfflineMode) {
            const lastUser = localStorage.getLastStoredUser()
            return {
                endpoint: lastUser?.endpoint ?? 'https://offline.sourcegraph.com',
                username: lastUser?.username ?? 'offline-user',
                authenticated: true,
                isOfflineMode: true,
                codyApiVersion: 0,
                siteVersion: '',
            }
        }

        // Cody Web can work without access token since authorization flow
        // relies on cookie authentication
        if (isCodyWeb) {
            if (!endpoint) {
                return { authenticated: false, endpoint }
            }
        } else {
            if (!token || !endpoint) {
                return { authenticated: false, endpoint }
            }
        }

        this.client = new SourcegraphGraphQLAPIClient(config)

        // Version is for frontend to check if Cody is not enabled due to unsupported version when siteHasCodyEnabled is false
        const [{ enabled: siteHasCodyEnabled, version: siteVersion }, codyLLMConfiguration, userInfo] =
            await Promise.all([
                this.client.isCodyEnabled(),
                this.client.getCodyLLMConfiguration(),
                this.client.getCurrentUserInfo(),
            ])

        logDebug('CodyLLMConfiguration', JSON.stringify(codyLLMConfiguration))
        // check first if it's a network error
        if (isError(userInfo) && isNetworkLikeError(userInfo)) {
            return { authenticated: false, showNetworkError: true, endpoint }
        }
        if (!userInfo || isError(userInfo)) {
            return { authenticated: false, endpoint, showInvalidAccessTokenError: true }
        }
        if (!siteHasCodyEnabled) {
            vscode.window.showErrorMessage(
                `Cody is not enabled on this Sourcegraph instance (${endpoint}). Ask a site administrator to enable it.`
            )
            return { authenticated: false, endpoint }
        }

        const configOverwrites = isError(codyLLMConfiguration) ? undefined : codyLLMConfiguration

        if (!isDotCom(endpoint)) {
            return newAuthStatus({
                ...userInfo,
                endpoint,
                siteVersion,
                configOverwrites,
                authenticated: true,
                hasVerifiedEmail: false,
                userCanUpgrade: false,
            })
        }

        // Configure AuthStatus for DotCom users

        const proStatus = await this.client.getCurrentUserCodySubscription()
        // Pro user without the pending status is the valid pro users
        const isActiveProUser =
            proStatus !== null &&
            'plan' in proStatus &&
            proStatus.plan === 'PRO' &&
            proStatus.status !== 'PENDING'

        return newAuthStatus({
            ...userInfo,
            endpoint,
            siteVersion,
            configOverwrites,
            authenticated: !!userInfo.id,
            userCanUpgrade: !isActiveProUser,
            primaryEmail: userInfo.primaryEmail?.email ?? '',
        })
    }

    // It processes the authentication steps and stores the login info before sharing the auth status with chatview
    public async auth({
        endpoint,
        token,
        customHeaders,
        isExtensionStartup = false,
        isOfflineMode = false,
    }: {
        endpoint: string
        token: string | null
        customHeaders?: Record<string, string> | null
        isExtensionStartup?: boolean
        isOfflineMode?: boolean
    }): Promise<AuthStatus> {
        const formattedEndpoint = formatURL(endpoint)
        if (!formattedEndpoint) {
            throw new Error(`invalid endpoint URL: ${JSON.stringify(endpoint)}`)
        }

        const { configuration } = await currentResolvedConfig()
        const config = {
            serverEndpoint: formattedEndpoint,
            accessToken: token,
            customHeaders: customHeaders || configuration.customHeaders,
        }

        try {
            const authStatus = await this.makeAuthStatus(config, isOfflineMode)

            if (!isOfflineMode) {
                await this.storeAuthInfo(config.serverEndpoint, config.accessToken)
            }

            await vscode.commands.executeCommand(
                'setContext',
                'cody.activated',
                authStatus.authenticated
            )

            await this.updateAuthStatus(authStatus)

            // If the extension is authenticated on startup, it can't be a user's first
            // ever authentication. We store this to prevent logging first-ever events
            // for already existing users.
            if (isExtensionStartup && authStatus.authenticated) {
                await this.setHasAuthenticatedBefore()
            } else if (authStatus.authenticated) {
                this.handleFirstEverAuthentication()
            }

            return authStatus
        } catch (error) {
            logDebug('AuthProvider:auth', 'failed', error)

            // Try to reload auth status in case of network error, else return default auth status
            return await this.reloadAuthStatus().catch(() => ({
                authenticated: false,
                endpoint: config.serverEndpoint,
            }))
        }
    }

    // Set auth status in case of reload
    public async reloadAuthStatus(): Promise<AuthStatus> {
        await vscode.commands.executeCommand('setContext', 'cody.activated', false)

        const { configuration, auth } = await currentResolvedConfig()
        return await this.auth({
            endpoint: auth.serverEndpoint,
            token: auth.accessToken,
            customHeaders: configuration.customHeaders,
        })
    }

    private async updateAuthStatus(authStatus: AuthStatus): Promise<void> {
        try {
            this.status.next(authStatus)

            // We update the graphqlClient and ModelsService first
            // because many listeners rely on these
            graphqlClient.setConfig(await getFullConfig())
            await ClientConfigSingleton.getInstance().setAuthStatus(authStatus)
        } catch (error) {
            logDebug('AuthProvider', 'updateAuthStatus error', error)
        } finally {
            let eventValue: 'disconnected' | 'connected' | 'failed'
            if (authStatus.authenticated) {
                eventValue = 'connected'
            } else if (authStatus.showNetworkError || authStatus.showInvalidAccessTokenError) {
                eventValue = 'failed'
            } else {
                eventValue = 'disconnected'
            }
            telemetryRecorder.recordEvent('cody.auth', eventValue, {
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        }
    }

    // Store endpoint in local storage, token in secret storage, and update endpoint history.
    private async storeAuthInfo(
        endpoint: string | null | undefined,
        token: string | null | undefined
    ): Promise<void> {
        if (!endpoint) {
            return
        }
        await localStorage.saveEndpoint(endpoint)
        if (token) {
            await secretStorage.storeToken(endpoint, token)
        }
    }

    public setAuthPendingToEndpoint(endpoint: string): void {
        this.status.next({ authenticated: false, endpoint })
    }

    // Logs a telemetry event if the user has never authenticated to Sourcegraph.
    private handleFirstEverAuthentication(): void {
        if (localStorage.get(HAS_AUTHENTICATED_BEFORE_KEY)) {
            // User has authenticated before, noop
            return
        }
        telemetryRecorder.recordEvent('cody.auth.login', 'firstEver', {
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })
        this.setHasAuthenticatedBefore()
        void maybeStartInteractiveTutorial()
    }

    private setHasAuthenticatedBefore() {
        return localStorage.set(HAS_AUTHENTICATED_BEFORE_KEY, 'true')
    }
}

export const authProvider = new AuthProvider()
