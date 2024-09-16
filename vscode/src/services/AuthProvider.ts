import * as vscode from 'vscode'

import {
    type AuthStatus,
    CodyIDE,
    type PickResolvedConfiguration,
    SourcegraphGraphQLAPIClient,
    type Unsubscribable,
    currentResolvedConfig,
    dependentAbortController,
    isAbortError,
    isDotCom,
    isError,
    isNetworkLikeError,
    logError,
    resolvedConfig,
    setAuthStatusObservable,
    take,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { Subject } from 'observable-fns'
import { formatURL } from '../auth/auth'
import { newAuthStatus } from '../chat/utils'
import { logDebug } from '../log'
import { maybeStartInteractiveTutorial } from '../tutorial/helpers'
import { localStorage } from './LocalStorageProvider'
import { secretStorage } from './SecretStorageProvider'

const HAS_AUTHENTICATED_BEFORE_KEY = 'has-authenticated-before'

class AuthProvider implements vscode.Disposable {
    private status = new Subject<AuthStatus>()
    private configSubscription: Unsubscribable

    constructor() {
        setAuthStatusObservable(this.status)

        // Perform auth as config changes.
        this.configSubscription = resolvedConfig.pipe(take(1)).subscribe(async ({ auth }) => {
            // Immediately emit the current status so the endpoint is known. Emitting
            // `authenticated: false` for a brief period is both true and a way to ensure that
            // subscribers are robust to changes in authentication status.
            this.status.next({ authenticated: false, endpoint: auth.serverEndpoint })

            if (this.inflightAuth) {
                // Don't cancel an explicitly invoked in-flight auth request.
                return
            }
            await this.auth({
                endpoint: auth.serverEndpoint,
                token: auth.accessToken,
                isExtensionStartup: true,
            }).catch(error =>
                logError('AuthProvider:init:failed', auth.serverEndpoint, { verbose: error })
            )
        })
    }

    public dispose(): void {
        this.configSubscription.unsubscribe()
    }

    // Create Auth Status
    private async makeAuthStatus(
        config: PickResolvedConfiguration<{ configuration: 'customHeaders'; auth: true }>,
        signal: AbortSignal
    ): Promise<AuthStatus> {
        const endpoint = config.auth.serverEndpoint
        const token = config.auth.accessToken

        const prevConfig = await currentResolvedConfig()
        const isCodyWeb = prevConfig.configuration.agentIDE === CodyIDE.Web

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

        // Check if credentials are valid and if Cody is enabled for the credentials and endpoint.
        const client = SourcegraphGraphQLAPIClient.withStaticConfig({
            configuration: {
                ...prevConfig.configuration,
                customHeaders: config.configuration.customHeaders,
            },
            auth: config.auth,
            clientState: prevConfig.clientState,
        })

        // Version is for frontend to check if Cody is not enabled due to unsupported version when siteHasCodyEnabled is false
        const [{ enabled: siteHasCodyEnabled, version: siteVersion }, codyLLMConfiguration, userInfo] =
            await Promise.all([
                client.isCodyEnabled(signal),
                client.getCodyLLMConfiguration(signal),
                client.getCurrentUserInfo(signal),
            ])
        signal.throwIfAborted()

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

        const proStatus = await client.getCurrentUserCodySubscription()
        // Pro user without the pending status is the valid pro users
        const isActiveProUser =
            proStatus !== null &&
            'plan' in proStatus &&
            proStatus.plan === 'PRO' &&
            proStatus.status !== 'PENDING'

        return newAuthStatus({
            ...userInfo,
            authenticated: true,
            endpoint,
            siteVersion,
            configOverwrites,
            userCanUpgrade: !isActiveProUser,
        })
    }

    private inflightAuth: AbortController | null = null

    // It processes the authentication steps and stores the login info before sharing the auth status with chatview
    public async auth({
        endpoint,
        token,
        customHeaders,
        isExtensionStartup = false,
        signal,
    }: {
        endpoint: string
        token: string | null
        customHeaders?: Record<string, string> | null
        isExtensionStartup?: boolean
        signal?: AbortSignal
    }): Promise<AuthStatus> {
        if (this.inflightAuth) {
            this.inflightAuth.abort()
        }
        const abortController = dependentAbortController(signal)
        this.inflightAuth = abortController

        const formattedEndpoint = formatURL(endpoint)
        if (!formattedEndpoint) {
            throw new Error(`invalid endpoint URL: ${JSON.stringify(endpoint)}`)
        }

        const { configuration } = await currentResolvedConfig()
        const config: PickResolvedConfiguration<{ configuration: 'customHeaders'; auth: true }> = {
            configuration: { customHeaders: customHeaders || configuration.customHeaders },
            auth: { serverEndpoint: formattedEndpoint, accessToken: token },
        }

        try {
            const authStatus = await this.makeAuthStatus(config, abortController.signal)
            abortController.signal.throwIfAborted()

            await vscode.commands.executeCommand(
                'setContext',
                'cody.activated',
                authStatus.authenticated
            )
            abortController.signal.throwIfAborted()

            await localStorage.saveEndpoint(config.auth.serverEndpoint)
            if (config.auth.accessToken) {
                await secretStorage.storeToken(config.auth.serverEndpoint, config.auth.accessToken)
            }
            await this.updateAuthStatus(authStatus, abortController.signal)
            abortController.signal.throwIfAborted()

            // If the extension is authenticated on startup, it can't be a user's first
            // ever authentication. We store this to prevent logging first-ever events
            // for already existing users.
            if (isExtensionStartup && authStatus.authenticated) {
                await this.setHasAuthenticatedBefore()
                abortController.signal.throwIfAborted()
            } else if (authStatus.authenticated) {
                this.handleFirstEverAuthentication()
            }

            return authStatus
        } catch (error) {
            if (isAbortError(error)) {
                throw error
            }
            logDebug('AuthProvider:auth', 'failed', error)
            return {
                endpoint,
                authenticated: false,
                showInvalidAccessTokenError: true,
            }
        } finally {
            if (this.inflightAuth === abortController) {
                this.inflightAuth = null
            }
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

    private async updateAuthStatus(authStatus: AuthStatus, signal: AbortSignal): Promise<void> {
        try {
            this.status.next(authStatus)
        } catch (error) {
            if (!isAbortError(error)) {
                logDebug('AuthProvider', 'updateAuthStatus error', error)
            }
        } finally {
            if (!signal.aborted) {
                let eventValue: 'disconnected' | 'connected' | 'failed'
                if (
                    !authStatus.authenticated &&
                    (authStatus.showNetworkError || authStatus.showInvalidAccessTokenError)
                ) {
                    eventValue = 'failed'
                } else if (authStatus.authenticated) {
                    eventValue = 'connected'
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
