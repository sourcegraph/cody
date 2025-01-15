import { isDotCom } from '../sourcegraph-api/environments'
import { NeedsAuthChallengeError } from '../sourcegraph-api/errors'
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

/**
 * An error representing the condition where the endpoint is not available due to lack of network
 * connectivity, server downtime, or other configuration issues *unrelated to* the validity of the
 * credentials.
 */
export interface AvailabilityError {
    type: 'availability-error'

    /**
     * Whether the error is due to a proxy needing the user to complete an auth challenge. See
     * {@link NeedsAuthChallengeError}.
     */
    needsAuthChallenge?: boolean
}

export interface InvalidAccessTokenError {
    type: 'invalid-access-token'
}

export interface EnterpriseUserDotComError {
    type: 'enterprise-user-logged-into-dotcom'
    enterprise: string
}

export interface AuthConfigError {
    type: 'auth-config-error'
    message: string
}

export interface ExternalAuthProviderError {
    type: 'external-auth-provider-error'
    message: string
}

export type AuthenticationError =
    | AvailabilityError
    | InvalidAccessTokenError
    | EnterpriseUserDotComError
    | AuthConfigError
    | ExternalAuthProviderError

export interface AuthenticationErrorMessage {
    title?: string
    message: string
    showTryAgain?: boolean
}

export function getAuthErrorMessage(error: AuthenticationError): AuthenticationErrorMessage {
    switch (error.type) {
        case 'availability-error':
            return error.needsAuthChallenge
                ? NeedsAuthChallengeError.TITLE_AND_MESSAGE
                : {
                      title: 'Network Error',
                      message: 'Sourcegraph is unreachable',
                      showTryAgain: true,
                  }
        case 'invalid-access-token':
            return {
                title: 'Invalid Access Token',
                message: 'The access token is invalid or has expired',
            }
        case 'enterprise-user-logged-into-dotcom':
            return {
                title: 'Enterprise User Authentication Error',
                message:
                    'Based on your email address we think you may be an employee of ' +
                    `${error.enterprise}. To get access to all your features please sign ` +
                    "in through your organization's enterprise instance instead. If you need assistance " +
                    'please contact your Sourcegraph admin.',
            }
        case 'auth-config-error':
            return {
                title: 'Auth Config Error',
                message: error.message,
            }
        case 'external-auth-provider-error':
            return {
                title: 'External Auth Provider Error',
                message: error.message,
            }
    }
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
