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

export type AuthenticationError =
    | {
          type: 'network-error'
      }
    | {
          type: 'invalid-access-token'
      }
    | {
          type: 'enterprise-user-logged-into-dotcom'
          enterprise: string
      }

export interface AuthenticationErrorMessage {
    title?: string
    message: string
}

export function getAuthErrorMessage(error: AuthenticationError): AuthenticationErrorMessage {
    switch (error.type) {
        case 'network-error':
            return {
                title: 'Network Error',
                message: 'Cody is unreachable',
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
                    "in through your organization's enterprise instance instead. If you need assistance" +
                    'please contact your Sourcegraph admin.',
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
