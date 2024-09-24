import { isDotCom } from '../sourcegraph-api/environments'
import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'

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
    siteVersion: string
    codyApiVersion: number
    configOverwrites?: CodyLLMSiteConfiguration

    primaryEmail?: string
    displayName?: string
    avatarURL?: string
    /**
     * Whether the users account can be upgraded.
     *
     * This is `true` if the user is on dotCom and has not already upgraded. It
     * is used to customize rate limit messages and show additional upgrade
     * buttons in the UI.
     */
    userCanUpgrade?: boolean
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
}

export const AUTH_STATUS_FIXTURE_AUTHED: AuthenticatedAuthStatus = {
    endpoint: 'https://example.com',
    authenticated: true,
    username: 'alice',
    codyApiVersion: 1,
    siteVersion: '9999',
}

export const AUTH_STATUS_FIXTURE_UNAUTHED: AuthStatus & { authenticated: false } = {
    endpoint: 'https://example.com',
    authenticated: false,
}

export const AUTH_STATUS_FIXTURE_AUTHED_DOTCOM: AuthenticatedAuthStatus = {
    ...AUTH_STATUS_FIXTURE_AUTHED,
    endpoint: 'https://sourcegraph.com',
    configOverwrites: {
        provider: 'sourcegraph',
        completionModel: 'fireworks/starcoder-hybrid',
    },
}

export function isCodyProUser(authStatus: AuthStatus): boolean {
    return isDotCom(authStatus) && authStatus.authenticated && !authStatus.userCanUpgrade
}

export function isFreeUser(authStatus: AuthStatus): boolean {
    return isDotCom(authStatus) && authStatus.authenticated && !!authStatus.userCanUpgrade
}

export function isEnterpriseUser(authStatus: AuthStatus): boolean {
    return !isDotCom(authStatus)
}
