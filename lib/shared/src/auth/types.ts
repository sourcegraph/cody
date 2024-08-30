import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'

/**
 * The status of a users authentication, whether they're authenticated and have
 * a verified email.
 */
export interface AuthStatus {
    username: string
    endpoint: string
    isDotCom: boolean
    /**
     * Used to enable Fireworks tracing for Sourcegraph teammates on DotCom.
     * https://readme.fireworks.ai/docs/enabling-tracing
     */
    isFireworksTracingEnabled: boolean
    showInvalidAccessTokenError: boolean
    authenticated: boolean
    hasVerifiedEmail: boolean
    requiresVerifiedEmail: boolean
    siteHasCodyEnabled: boolean
    siteVersion: string
    codyApiVersion: number
    configOverwrites?: CodyLLMSiteConfiguration
    showNetworkError?: boolean
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
    userCanUpgrade: boolean
}

export interface AuthStatusProvider {
    status: AuthStatus
}

export const defaultAuthStatus: AuthStatus = {
    endpoint: 'https://example.com',
    isDotCom: true,
    isFireworksTracingEnabled: false,
    username: 'alice',
    authenticated: true,
    siteHasCodyEnabled: true,
    siteVersion: '',
    codyApiVersion: 0,
    showInvalidAccessTokenError: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    userCanUpgrade: false,
}

export const unauthenticatedStatus: AuthStatus = {
    endpoint: '',
    isDotCom: true,
    isFireworksTracingEnabled: false,
    showInvalidAccessTokenError: true,
    authenticated: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    codyApiVersion: 0,
}

export const networkErrorAuthStatus: Omit<AuthStatus, 'endpoint'> = {
    isDotCom: false,
    showInvalidAccessTokenError: false,
    authenticated: false,
    isFireworksTracingEnabled: false,
    hasVerifiedEmail: false,
    showNetworkError: true,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    codyApiVersion: 0,
}

export function isCodyProUser(authStatus: AuthStatus): boolean {
    return Boolean(authStatus.isDotCom && authStatus.user && !authStatus.user.userCanUpgrade)
}

export function isFreeUser(authStatus: AuthStatus): boolean {
    return Boolean(authStatus.isDotCom && authStatus.user && authStatus.user.userCanUpgrade)
}

export function isEnterpriseUser(authStatus: AuthStatus): boolean {
    return !authStatus.isDotCom
}
