import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'

/**
 * The status of a users authentication, whether they're authenticated and have
 * a verified email.
 */
export interface AuthStatus {
    username: string
    endpoint: string | null
    isDotCom: boolean
    isLoggedIn: boolean
    showInvalidAccessTokenError: boolean
    authenticated: boolean
    hasVerifiedEmail: boolean
    requiresVerifiedEmail: boolean
    siteHasCodyEnabled: boolean
    siteVersion: string
    codyApiVersion: number
    configOverwrites?: CodyLLMSiteConfiguration
    showNetworkError?: boolean
    primaryEmail: string
    displayName?: string
    avatarURL: string
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
    getAuthStatus(): AuthStatus
}

export const defaultAuthStatus = {
    endpoint: '',
    isDotCom: true,
    isLoggedIn: false,
    showInvalidAccessTokenError: false,
    authenticated: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    primaryEmail: '',
    displayName: '',
    avatarURL: '',
    codyApiVersion: 0,
} satisfies AuthStatus

export const unauthenticatedStatus = {
    endpoint: '',
    isDotCom: true,
    isLoggedIn: false,
    showInvalidAccessTokenError: true,
    authenticated: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    primaryEmail: '',
    displayName: '',
    avatarURL: '',
    codyApiVersion: 0,
} satisfies AuthStatus

export const networkErrorAuthStatus = {
    isDotCom: false,
    showInvalidAccessTokenError: false,
    authenticated: false,
    isLoggedIn: false,
    hasVerifiedEmail: false,
    showNetworkError: true,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    primaryEmail: '',
    displayName: '',
    avatarURL: '',
    codyApiVersion: 0,
} satisfies Omit<AuthStatus, 'endpoint'>
