import {
    type AuthCredentials,
    type AuthStatus,
    type ClientCapabilitiesWithLegacyFields,
    ClientConfigSingleton,
    DOTCOM_URL,
    EMPTY,
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
    resolvedConfig as resolvedConfig_,
    setAuthStatusObservable as setAuthStatusObservable_,
    startWith,
    switchMap,
    telemetryRecorder,
    withLatestFrom,
} from '@sourcegraph/cody-shared'
import { normalizeServerEndpointURL } from '@sourcegraph/cody-shared/src/configuration/auth-resolver'
import {
    isAvailabilityError,
    isEnterpriseUserDotComError,
    isInvalidAccessTokenError,
    isNeedsAuthChallengeError,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import isEqual from 'lodash/isEqual'
import { Observable, Subject, interval } from 'observable-fns'
import * as vscode from 'vscode'
import { serializeConfigSnapshot } from '../../uninstall/serializeConfig'
import { type ResolvedConfigurationCredentialsOnly, validateCredentials } from '../auth/auth'
import { logError } from '../output-channel-logger'
import { maybeStartInteractiveTutorial } from '../tutorial/helpers'
import { version } from '../version'
import { localStorage } from './LocalStorageProvider'

const HAS_AUTHENTICATED_BEFORE_KEY = 'has-authenticated-before'

class AuthProvider implements vscode.Disposable {
    private status = new Subject<AuthStatus>()
    private refreshRequests = new Subject<boolean>()

    /**
     * Credentials that were already validated with
     * {@link AuthProvider.validateAndStoreCredentials}.
     */
    private lastValidatedAndStoredCredentials =
        new Subject<ResolvedConfigurationCredentialsOnly | null>()
    private lastEndpoint: string | undefined

    private hasAuthed = false

    private subscriptions: Unsubscribable[] = []

    private async validateAndUpdateAuthStatus(
        credentials: ResolvedConfigurationCredentialsOnly,
        signal?: AbortSignal,
        resetInitialAuthStatus?: boolean
    ): Promise<void> {
        if (resetInitialAuthStatus ?? true) {
            // Immediately emit the unauthenticated status while we are authenticating.
            // Emitting `authenticated: false` for a brief period is both true and a
            // way to ensure that subscribers are robust to changes in
            // authentication status.
            this.status.next({
                authenticated: false,
                pendingValidation: true,
                endpoint: credentials.auth.serverEndpoint,
            })
        }

        try {
            const authStatus = await validateCredentials(credentials, signal, undefined)
            signal?.throwIfAborted()
            this.status.next(authStatus)
            await this.handleAuthTelemetry(authStatus, signal)
        } catch (error) {
            if (!isAbortError(error)) {
                logError('AuthProvider', 'Unexpected error validating credentials', error)
            }
        }
    }

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

        this.subscriptions.push(
            ClientConfigSingleton.getInstance()
                .updates.pipe(
                    abortableOperation(async (config, signal) => {
                        const nextAuthStatus = await validateCredentials(
                            await currentResolvedConfig(),
                            signal,
                            config
                        )
                        // The only case where client config impacts the auth status is when the user is
                        // logged into dotcom but the client config is set to use an enterprise instance
                        // we explicitly check for this error and only update if so
                        if (
                            !nextAuthStatus.authenticated &&
                            isEnterpriseUserDotComError(nextAuthStatus.error)
                        ) {
                            this.status.next(nextAuthStatus)
                        }
                    })
                )
                .subscribe({})
        )

        // Perform auth as config changes.
        this.subscriptions.push(
            combineLatest(
                credentialsChangesNeedingValidation,
                this.refreshRequests.pipe(startWith(true))
            )
                .pipe(
                    abortableOperation(async ([config, resetInitialAuthStatus], signal) => {
                        if (getClientCapabilities().isCodyWeb) {
                            // Cody Web calls {@link AuthProvider.validateAndStoreCredentials}
                            // explicitly. This early exit prevents duplicate authentications during
                            // the initial load.
                            return
                        }
                        await this.validateAndUpdateAuthStatus(config, signal, resetInitialAuthStatus)
                    })
                )
                .subscribe({})
        )

        // Try to reauthenticate periodically when the authentication failed due to an availability
        // error (which is ephemeral and the underlying error condition may no longer exist).
        this.subscriptions.push(
            authStatus
                .pipe(
                    switchMap(authStatus => {
                        if (!authStatus.authenticated && isNeedsAuthChallengeError(authStatus.error)) {
                            // This interval is short because we want to quickly authenticate after
                            // the user successfully performs the auth challenge. If automatic auth
                            // refresh is expanded to include other conditions (such as any network
                            // connectivity gaps), it should probably have a longer interval, and we
                            // need to respect
                            // https://linear.app/sourcegraph/issue/CODY-3745/codys-background-periodic-network-access-causes-2fa.
                            const intervalMsec = 2500
                            return interval(intervalMsec)
                        }
                        return EMPTY
                    })
                )
                .subscribe(() => {
                    this.refreshRequests.next(false)
                })
        )

        // Keep context updated with auth status.
        this.subscriptions.push(
            authStatus.subscribe(authStatus => {
                try {
                    this.lastEndpoint = authStatus.endpoint
                    vscode.commands.executeCommand('authStatus.update', authStatus)
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
    public refresh(resetInitialAuthStatus = true): void {
        this.lastValidatedAndStoredCredentials.next(null)
        this.refreshRequests.next(resetInitialAuthStatus)
    }

    public signout(endpoint: string): void {
        if (this.lastEndpoint !== endpoint) {
            return
        }
        this.lastValidatedAndStoredCredentials.next(null)
        this.status.next({
            authenticated: false,
            endpoint: DOTCOM_URL.toString(),
            pendingValidation: false,
        })
    }

    public async validateAndStoreCredentials(
        config: ResolvedConfigurationCredentialsOnly | AuthCredentials,
        mode: 'store-if-valid' | 'always-store'
    ): Promise<AuthStatus> {
        let credentials: ResolvedConfigurationCredentialsOnly
        if ('auth' in config) {
            credentials = toCredentialsOnlyNormalized(config)
        } else {
            const prevConfig = await currentResolvedConfig()
            credentials = toCredentialsOnlyNormalized({
                configuration: prevConfig.configuration,
                auth: config,
                clientState: prevConfig.clientState,
            })
        }

        const authStatus = await validateCredentials(credentials, undefined)
        const shouldStore = mode === 'always-store' || authStatus.authenticated
        if (shouldStore) {
            await Promise.all([
                localStorage.saveEndpointAndToken(credentials.auth),
                this.serializeUninstallerInfo(authStatus),
            ])
            this.lastValidatedAndStoredCredentials.next(credentials)
            this.status.next(authStatus)
        }
        if (!shouldStore) {
            // Always report telemetry even if we don't store it.
            reportAuthTelemetryEvent(authStatus)
        }
        await this.handleAuthTelemetry(authStatus, undefined)
        return authStatus
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
        (isAvailabilityError(authStatus.error) || isInvalidAccessTokenError(authStatus.error))
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
