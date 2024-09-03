import * as vscode from 'vscode'

import {
    type AuthStatus,
    type AuthStatusProvider,
    type AuthenticatedAuthStatus,
    ClientConfigSingleton,
    type ClientConfigurationWithAccessToken,
    CodyIDE,
    NO_INITIAL_VALUE,
    type ReadonlyDeep,
    SourcegraphGraphQLAPIClient,
    distinctUntilChanged,
    fromVSCodeEvent,
    graphqlClient,
    isDotCom,
    isError,
    isNetworkLikeError,
    logError,
    singletonNotYetSet,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import type { Observable } from 'observable-fns'
import { formatURL } from '../auth/auth'
import { newAuthStatus } from '../chat/utils'
import { getFullConfig } from '../configuration'
import { logDebug } from '../log'
import { syncModels } from '../models/sync'
import { maybeStartInteractiveTutorial } from '../tutorial/helpers'
import { localStorage } from './LocalStorageProvider'
import { secretStorage } from './SecretStorageProvider'

const HAS_AUTHENTICATED_BEFORE_KEY = 'has-authenticated-before'

type AuthConfig = Pick<
    ClientConfigurationWithAccessToken,
    'serverEndpoint' | 'accessToken' | 'customHeaders'
>
export class AuthProvider implements AuthStatusProvider, vscode.Disposable {
    private client: SourcegraphGraphQLAPIClient | null = null
    private _status: AuthStatus | null = null
    private readonly didChangeEvent: vscode.EventEmitter<AuthStatus> =
        new vscode.EventEmitter<AuthStatus>()
    private disposables: vscode.Disposable[] = [this.didChangeEvent]

    constructor(private config: AuthConfig) {}

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    // Sign into the last endpoint the user was signed into, if any
    public async init(): Promise<void> {
        const lastEndpoint = localStorage?.getEndpoint() || this.config.serverEndpoint
        const token = (await secretStorage.get(lastEndpoint || '')) || this.config.accessToken
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

    public changes: Observable<ReadonlyDeep<AuthStatus>> = fromVSCodeEvent(
        this.didChangeEvent.event,
        () => this._status ?? NO_INITIAL_VALUE
    ).pipe(distinctUntilChanged())

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
        // Cache the config and GraphQL client
        if (this.config !== config || !this.client) {
            this.config = config
            this.client = new SourcegraphGraphQLAPIClient(config)
        }
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

    public get status(): ReadonlyDeep<AuthStatus> {
        if (!this._status) {
            throw new Error('AuthStatus is not initialized')
        }
        return this._status
    }

    /** Like {@link AuthProvider.status} but throws if not authed. */
    public get statusAuthed(): ReadonlyDeep<AuthenticatedAuthStatus> {
        if (!this._status) {
            throw new Error('AuthStatus is not initialized')
        }
        if (!this._status.authenticated) {
            throw new Error('Not authenticated')
        }
        return this._status satisfies AuthenticatedAuthStatus
    }

    /** Like {@link AuthProvider.status} but returns null instead of throwing if not ready. */
    public get statusOrNotReadyYet(): AuthStatus | null {
        return this._status
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

        const config = {
            serverEndpoint: formattedEndpoint,
            accessToken: token,
            customHeaders: customHeaders || this.config.customHeaders,
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

            await this.setAuthStatus(authStatus)

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

        this.config = await getFullConfig()
        return await this.auth({
            endpoint: this.config.serverEndpoint,
            token: this.config.accessToken,
            customHeaders: this.config.customHeaders,
        })
    }

    // Set auth status and share it with chatview
    private async setAuthStatus(authStatus: AuthStatus): Promise<void> {
        if (this._status === authStatus) {
            return
        }
        this._status = authStatus

        await this.updateAuthStatus(authStatus)
    }

    private async updateAuthStatus(authStatus: AuthStatus): Promise<void> {
        try {
            // We update the graphqlClient and ModelsService first
            // because many listeners rely on these
            graphqlClient.setConfig(await getFullConfig())
            await ClientConfigSingleton.getInstance().setAuthStatus(authStatus)
            await syncModels(authStatus)
        } catch (error) {
            logDebug('AuthProvider', 'updateAuthStatus error', error)
        } finally {
            this.didChangeEvent.fire(this.status)
            let eventValue: 'disconnected' | 'connected' | 'failed'
            if (authStatus.authenticated) {
                eventValue = 'connected'
            } else if (authStatus.showNetworkError || authStatus.showInvalidAccessTokenError) {
                eventValue = 'failed'
            } else {
                eventValue = 'disconnected'
            }
            telemetryRecorder.recordEvent('cody.auth', eventValue)
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
        this._status = { authenticated: false, endpoint }
        this.didChangeEvent.fire(this._status)
    }

    // Logs a telemetry event if the user has never authenticated to Sourcegraph.
    private handleFirstEverAuthentication(): void {
        if (localStorage.get(HAS_AUTHENTICATED_BEFORE_KEY)) {
            // User has authenticated before, noop
            return
        }
        telemetryRecorder.recordEvent('cody.auth.login', 'firstEver')
        this.setHasAuthenticatedBefore()
        void maybeStartInteractiveTutorial()
    }

    private setHasAuthenticatedBefore() {
        return localStorage.set(HAS_AUTHENTICATED_BEFORE_KEY, 'true')
    }
}

export const authProvider = singletonNotYetSet<AuthProvider>()
