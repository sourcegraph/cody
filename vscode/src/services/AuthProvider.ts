import * as vscode from 'vscode'

import {
    type AuthCredentials,
    type AuthStatus,
    type ClientCapabilitiesWithLegacyFields,
    DOTCOM_URL,
    NEVER,
    type ResolvedConfiguration,
    type Unsubscribable,
    abortableOperation,
    authStatus,
    combineLatest,
    currentResolvedConfig,
    disposableSubscription,
    distinctUntilChanged,
    clientCapabilities as getClientCapabilities,
    isAbortError,
    normalizeServerEndpointURL,
    resolvedConfig as resolvedConfig_,
    setAuthStatusObservable as setAuthStatusObservable_,
    startWith,
    switchMap,
    telemetryRecorder,
    withLatestFrom,
} from '@sourcegraph/cody-shared'
import isEqual from 'lodash/isEqual'
import { Observable, Subject } from 'observable-fns'
import { serializeConfigSnapshot } from '../../uninstall/serializeConfig'
import { type ResolvedConfigurationCredentialsOnly, validateCredentials } from '../auth/auth'
import { logError } from '../output-channel-logger'
import { maybeStartInteractiveTutorial } from '../tutorial/helpers'
import { version } from '../version'
import { localStorage } from './LocalStorageProvider'

const HAS_AUTHENTICATED_BEFORE_KEY = 'has-authenticated-before'

class AuthProvider implements vscode.Disposable {
    private status = new Subject<AuthStatus>()
    private refreshRequests = new Subject<void>()

    /**
     * Credentials that were already validated with
     * {@link AuthProvider.validateAndStoreCredentials}.
     */
    private lastValidatedAndStoredCredentials =
        new Subject<ResolvedConfigurationCredentialsOnly | null>()

    private hasAuthed = false

    private subscriptions: Unsubscribable[] = []

    constructor(setAuthStatusObservable = setAuthStatusObservable_, resolvedConfig = resolvedConfig_) {
        setAuthStatusObservable(this.status.pipe(distinctUntilChanged()))

        const credentialsChangesNeedingValidation = resolvedConfig.pipe(
            withLatestFrom(this.lastValidatedAndStoredCredentials.pipe(startWith(null))),
            switchMap(([config, lastValidatedCredentials]) => {
                const credentials: ResolvedConfigurationCredentialsOnly =
                    toCredentialsOnlyNormalized(config)
                return isEqual(credentials, lastValidatedCredentials)
                    ? NEVER
                    : Observable.of(credentials)
            }),
            distinctUntilChanged()
        )

        // Perform auth as config changes.
        this.subscriptions.push(
            combineLatest(
                credentialsChangesNeedingValidation,
                this.refreshRequests.pipe(startWith(undefined))
            )
                .pipe(
                    abortableOperation(async ([config], signal) => {
                        if (getClientCapabilities().isCodyWeb) {
                            // Cody Web calls {@link AuthProvider.validateAndStoreCredentials}
                            // explicitly. This early exit prevents duplicate authentications during
                            // the initial load.
                            return
                        }

                        // Immediately emit the unauthenticated status while we are authenticating.
                        // Emitting `authenticated: false` for a brief period is both true and a
                        // way to ensure that subscribers are robust to changes in
                        // authentication status.
                        this.status.next({
                            authenticated: false,
                            pendingValidation: true,
                            endpoint: config.auth.serverEndpoint,
                        })

                        try {
                            const authStatus = await validateCredentials(config, signal)
                            signal?.throwIfAborted()
                            this.status.next(authStatus)
                            await this.handleAuthTelemetry(authStatus, signal)
                        } catch (error) {
                            if (!isAbortError(error)) {
                                logError(
                                    'AuthProvider',
                                    'Unexpected error validating credentials',
                                    error
                                )
                            }
                        }
                    })
                )
                .subscribe({})
        )

        // Keep context updated with auth status.
        this.subscriptions.push(
            authStatus.subscribe(authStatus => {
                try {
                    vscode.commands.executeCommand(
                        'setContext',
                        'cody.activated',
                        authStatus.authenticated
                    )
                    vscode.commands.executeCommand(
                        'setContext',
                        'cody.serverEndpoint',
                        authStatus.endpoint
                    )
                } catch (error) {
                    logError('AuthProvider', 'Unexpected error while setting context', error)
                }
            })
        )

        // Report auth changes.
        this.subscriptions.push(startAuthTelemetryReporter())

        this.subscriptions.push(
            disposableSubscription(
                vscode.commands.registerCommand('cody.auth.refresh', () => this.refresh())
            )
        )
    }

    private async handleAuthTelemetry(authStatus: AuthStatus, signal?: AbortSignal): Promise<void> {
        // If the extension is authenticated on startup, it can't be a user's first
        // ever authentication. We store this to prevent logging first-ever events
        // for already existing users.
        const hasAuthed = this.hasAuthed
        this.hasAuthed = true
        if (!hasAuthed && authStatus.authenticated) {
            await this.setHasAuthenticatedBefore()
            signal?.throwIfAborted()
        } else if (authStatus.authenticated) {
            this.handleFirstEverAuthentication()
        }
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.unsubscribe()
        }
    }

    /**
     * Refresh the auth status.
     */
    public refresh(): void {
        this.lastValidatedAndStoredCredentials.next(null)
        this.refreshRequests.next()
    }

    public signout(): void {
        this.lastValidatedAndStoredCredentials.next(null)
        this.status.next({
            authenticated: false,
            endpoint: DOTCOM_URL.toString(),
            pendingValidation: false,
        })
    }

    public async validateAndStoreCredentials(
        config: ResolvedConfigurationCredentialsOnly | AuthCredentials,
        mode: 'store-if-valid' | 'always-store',
        signal?: AbortSignal
    ): Promise<{ isStored: boolean; authStatus: AuthStatus }> {
        let credentials: ResolvedConfigurationCredentialsOnly
        if ('auth' in config) {
            credentials = toCredentialsOnlyNormalized(config)
        } else {
            const prevConfig = await currentResolvedConfig()
            signal?.throwIfAborted()
            credentials = toCredentialsOnlyNormalized({
                configuration: prevConfig.configuration,
                auth: config,
                clientState: prevConfig.clientState,
            })
        }

        const authStatus = await validateCredentials(credentials, signal)
        signal?.throwIfAborted()
        const shouldStore = mode === 'always-store' || authStatus.authenticated
        if (shouldStore) {
            this.lastValidatedAndStoredCredentials.next(credentials)
            await Promise.all([
                localStorage.saveEndpointAndToken(credentials.auth),
                this.serializeUninstallerInfo(authStatus),
            ])
            this.status.next(authStatus)
            signal?.throwIfAborted()
        }
        if (!shouldStore) {
            // Always report telemetry even if we don't store it.
            reportAuthTelemetryEvent(authStatus)
        }
        await this.handleAuthTelemetry(authStatus, signal)
        return { isStored: shouldStore, authStatus }
    }

    public setAuthPendingToEndpoint(endpoint: string): void {
        // TODO(sqs)#observe: store this pending endpoint in clientState instead of authStatus
        this.status.next({ authenticated: false, endpoint, pendingValidation: true })
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

    // When the auth status is updated, we serialize the current configuration to disk,
    // so that it can be sent with Telemetry when the post-uninstall script runs.
    // we only write on auth change as that is the only significantly important factor
    // and we don't want to write too frequently (so we don't react to config changes)
    // The vscode API is not available in the post-uninstall script.
    // Public so that it can be mocked for testing
    public async serializeUninstallerInfo(authStatus: AuthStatus): Promise<void> {
        if (!authStatus.authenticated) return
        let clientCapabilities: ClientCapabilitiesWithLegacyFields | undefined
        try {
            clientCapabilities = getClientCapabilities()
        } catch {
            // If client capabilities cannot be retrieved, we will just synthesize
            // them from defaults in the post-uninstall script.
        }
        // TODO: put this behind a proper client capability if any other IDE's need to uninstall
        // the same way as VSCode (most editors have a proper uninstall hook)
        if (clientCapabilities?.isVSCode) {
            const config = localStorage.getConfig() ?? (await currentResolvedConfig())
            await serializeConfigSnapshot({
                config,
                authStatus,
                clientCapabilities,
                version,
            })
        }
    }
}

export const authProvider = new AuthProvider()

/**
 * @internal For testing only.
 */
export function newAuthProviderForTest(
    ...args: ConstructorParameters<typeof AuthProvider>
): AuthProvider {
    return new AuthProvider(...args)
}

function startAuthTelemetryReporter(): Unsubscribable {
    return authStatus.subscribe(authStatus => {
        reportAuthTelemetryEvent(authStatus)
    })
}

function reportAuthTelemetryEvent(authStatus: AuthStatus): void {
    if (authStatus.pendingValidation) {
        return // Not a valid event to report.
    }
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
        billingMetadata:
            eventValue === 'connected'
                ? {
                      product: 'cody',
                      category: 'billable',
                  }
                : undefined,
    })
}
function toCredentialsOnlyNormalized(
    config: ResolvedConfiguration | ResolvedConfigurationCredentialsOnly
): ResolvedConfigurationCredentialsOnly {
    return {
        configuration: {
            customHeaders: config.configuration.customHeaders,
        },
        auth: { ...config.auth, serverEndpoint: normalizeServerEndpointURL(config.auth.serverEndpoint) },
        clientState: { anonymousUserID: config.clientState.anonymousUserID },
    }
}
