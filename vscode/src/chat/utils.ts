import { AuthStatus, defaultAuthStatus, unauthenticatedStatus } from './protocol'

/**
 * Checks a user's authentication status.
 *
 * @param isDotComOrApp Whether the user is on an insider build instance or enterprise instance.
 * @param userId The user's ID.
 * @param isEmailVerified Whether the user has verified their email. Default to true for non-enterprise instances.
 * @param isCodyEnabled Whether Cody is enabled on the Sourcegraph instance. Default to true for non-enterprise instances.
 * @param version The Sourcegraph instance version.
 * @returns The user's authentication status. It's for frontend to display when instance is on unsupported version if siteHasCodyEnabled is false
 */
export function newAuthStatus(
    endpoint: string,
    isDotComOrApp: boolean,
    user: boolean,
    isEmailVerified: boolean,
    isCodyEnabled: boolean,
    version: string,
    configOverwrites?: AuthStatus['configOverwrites']
): AuthStatus {
    if (!user) {
        return { ...unauthenticatedStatus, endpoint }
    }
    const authStatus: AuthStatus = { ...defaultAuthStatus, endpoint }
    // Set values and return early
    authStatus.authenticated = user
    authStatus.showInvalidAccessTokenError = !user
    authStatus.requiresVerifiedEmail = isDotComOrApp
    authStatus.hasVerifiedEmail = isDotComOrApp && isEmailVerified
    authStatus.siteHasCodyEnabled = isCodyEnabled
    authStatus.siteVersion = version
    if (configOverwrites) {
        authStatus.configOverwrites = configOverwrites
    }
    const isLoggedIn = authStatus.siteHasCodyEnabled && authStatus.authenticated
    const isAllowed = authStatus.requiresVerifiedEmail ? authStatus.hasVerifiedEmail : true
    authStatus.isLoggedIn = isLoggedIn && isAllowed
    return authStatus
}
