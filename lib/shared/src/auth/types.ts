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
    showNetworkError?: boolean
    showInvalidAccessTokenError?: boolean
    pendingValidation: boolean
}

export const AUTH_STATUS_FIXTURE_AUTHED: AuthenticatedAuthStatus = {
    // this typecast is necessary to prevent codegen from becoming too specific
    endpoint: 'https://example.com' as string,
    authenticated: true,
    username: 'alice',
    pendingValidation: false,
}

export const AUTH_STATUS_FIXTURE_UNAUTHED: AuthStatus & { authenticated: false } = {
    // this typecast is necessary to prevent codegen from becoming too specific
    endpoint: 'https://example.com' as string,
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
