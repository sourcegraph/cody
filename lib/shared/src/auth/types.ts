import { isDotCom } from '../sourcegraph-api/environments'
import type { UserProductSubscription } from '../sourcegraph-api/userProductSubscription'

/**
 * The authentication status, which includes representing the state when authentication failed or
 * has not yet been attempted.
 */
export type AuthStatus = UnauthenticatedAuthStatus | AuthenticatedAuthStatus

/**
 * The authentication status for a user who has successfully authenticated.
 */
export interface AuthenticatedAuthStatus {
    endpoint: string

    authenticated: true

    username: string

    /**
     * Used to enable Fireworks tracing for Sourcegraph teammates on DotCom.
     * https://readme.fireworks.ai/docs/enabling-tracing
     */
    isFireworksTracingEnabled?: boolean

    hasVerifiedEmail?: boolean
    requiresVerifiedEmail?: boolean

    primaryEmail?: string
    displayName?: string
    avatarURL?: string

    pendingValidation: boolean

    /**
     * Organizations on the instance that the user is a member of.
     */
    organizations?: { name: string; id: string }[]
}

/**
 * The authentication status for a user who has not yet authenticated or for whom authentication
 * failed.
 */
export interface UnauthenticatedAuthStatus {
    endpoint: string
    authenticated: false
    error?: AuthenticationError
    pendingValidation: boolean
}

export class AuthenticationError extends Error {
    public title: string
    public showTryAgain = false

    constructor(title: string, message: string) {
        super(message)
        this.title = title
    }
}

/**
 * An error representing the condition where the endpoint is not available due to lack of network
 * connectivity, server downtime, or other configuration issues *unrelated to* the validity of the
 * credentials.
 */
export class AvailabilityError extends AuthenticationError {
    constructor() {
        super('Network Error', 'Sourcegraph is unreachable')
        // 'Network issues prevented Cody from signing in.'
        this.showTryAgain = true
    }
}

export class InvalidAccessTokenError extends AuthenticationError {
    // type: 'invalid-access-token'
    constructor() {
        super('Invalid Access Token', 'The access token is invalid or has expired')
        //'Your authentication has expired.\nSign in again to continue using Cody.',
    }
}

export class EnterpriseUserDotComError extends AuthenticationError {
    // type: 'enterprise-user-logged-into-dotcom'
    constructor(enterprise: string) {
        super(
            'Enterprise User Authentication Error',
            'Based on your email address we think you may be an employee of ' +
                `${enterprise}. To get access to all your features please sign ` +
                "in through your organization's enterprise instance instead. If you need assistance " +
                'please contact your Sourcegraph admin.'
        )
    }
}

export class AuthConfigError extends AuthenticationError {
    // type: 'auth-config-error'
    constructor(message: string) {
        super('Auth Config Error', message)
    }
}

export class ExternalAuthProviderError extends AuthenticationError {
    // public title = 'External Auth Provider Error'
    constructor(message: string) {
        super('External Auth Provider Error', message)
    }
}

/**
 * An error indicating that the user needs to complete an authentication challenge.
 */
export class NeedsAuthChallengeError extends AuthenticationError {
    constructor() {
        // See
        // https://linear.app/sourcegraph/issue/CODY-4695/handle-customer-proxy-re-auth-response-by-retrying-not-prompting-user
        // for an explanation of this message. If you need to change it to something more general,
        // consult the customers mentioned in that issue.
        super(
            'Tap Your YubiKey to Authenticate',
            `Your device's authentication expired and must be renewed to access Sourcegraph on your organization's network.`
        )
    }
}

export function isExternalProviderAuthError(error: unknown): error is ExternalAuthProviderError {
    return error instanceof ExternalAuthProviderError
}

export function isNeedsAuthChallengeError(error: unknown): error is NeedsAuthChallengeError {
    return error instanceof NeedsAuthChallengeError
}

export function isAvailabilityError(error: unknown): error is AvailabilityError {
    return error instanceof AvailabilityError
}

export function isInvalidAccessTokenError(error: unknown): error is InvalidAccessTokenError {
    return error instanceof InvalidAccessTokenError
}

export function isEnterpriseUserDotComError(error: unknown): error is EnterpriseUserDotComError {
    return error instanceof EnterpriseUserDotComError
}

export const AUTH_STATUS_FIXTURE_AUTHED: AuthenticatedAuthStatus = {
    endpoint: 'https://example.com',
    authenticated: true,
    username: 'alice',
    pendingValidation: false,
}

export const AUTH_STATUS_FIXTURE_UNAUTHED: AuthStatus & { authenticated: false } = {
    endpoint: 'https://example.com',
    authenticated: false,
    pendingValidation: false,
}

export const AUTH_STATUS_FIXTURE_AUTHED_DOTCOM: AuthenticatedAuthStatus = {
    ...AUTH_STATUS_FIXTURE_AUTHED,
    endpoint: 'https://sourcegraph.com' as string,
}

export function isCodyProUser(authStatus: AuthStatus, sub: UserProductSubscription | null): boolean {
    return isDotCom(authStatus) && authStatus.authenticated && sub !== null && !sub.userCanUpgrade
}

export function isFreeUser(authStatus: AuthStatus, sub: UserProductSubscription | null): boolean {
    return isDotCom(authStatus) && authStatus.authenticated && sub !== null && !!sub.userCanUpgrade
}

export function isEnterpriseUser(authStatus: AuthStatus): boolean {
    return !isDotCom(authStatus)
}
