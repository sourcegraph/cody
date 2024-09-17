import * as vscode from 'vscode'

import {
    type AuthCredentials,
    type AuthStatus,
    NEVER,
    type ResolvedConfiguration,
    type Unsubscribable,
    abortableOperation,
    authStatus,
    combineLatest,
    currentResolvedConfig,
    distinctUntilChanged,
    mergeMap,
    normalizeServerEndpointURL,
    pluck,
    resolvedConfig as resolvedConfig_,
    setAuthStatusObservable as setAuthStatusObservable_,
    startWith,
    telemetryRecorder,
    withLatestFrom,
} from '@sourcegraph/cody-shared'
import { isEqual } from 'lodash' // TODO!(sqs)
import { Observable, Subject } from 'observable-fns'
import { type ResolvedConfigurationCredentialsOnly, validateCredentials } from '../auth/auth'
import { maybeStartInteractiveTutorial } from '../tutorial/helpers'
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
            mergeMap(([config, lastValidatedCredentials]) => {
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
            combineLatest([
                credentialsChangesNeedingValidation,
                this.refreshRequests.pipe(startWith(undefined)),
            ])
                .pipe(
                    abortableOperation(async ([config], signal) => {
                        // Immediately emit the unauthenticated status while we are authenticating.
                        // Emitting `authenticated: false` for a brief period is both true and a
                        // way to ensure that subscribers are robust to changes in
                        // authentication status.
                        this.status.next({
                            authenticated: false,
                            endpoint: config.auth.serverEndpoint,
                        })

                        const authStatus = await validateCredentials(config, signal)
                        signal?.throwIfAborted()
                        this.status.next(authStatus)
                        await this.handleAuthTelemetry(authStatus, signal)
                    })
                )
                .subscribe({})
        )

        // Keep context updated with auth status.
        this.subscriptions.push(
            authStatus.pipe(pluck('authenticated')).subscribe(authenticated => {
                try {
                    vscode.commands.executeCommand('setContext', 'cody.activated', authenticated)
                } catch {}
            })
        )

        // Report auth changes.
        this.subscriptions.push(startAuthTelemetryReporter())
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
            await localStorage.saveEndpointAndToken(credentials.auth)
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

function toCredentialsOnlyNormalized(
    config: ResolvedConfiguration | ResolvedConfigurationCredentialsOnly
): ResolvedConfigurationCredentialsOnly {
    return {
        configuration: {
            agentIDE: config.configuration.agentIDE,
            customHeaders: config.configuration.customHeaders,
        },
        auth: { ...config.auth, serverEndpoint: normalizeServerEndpointURL(config.auth.serverEndpoint) },
        clientState: { anonymousUserID: config.clientState.anonymousUserID },
    }
}
