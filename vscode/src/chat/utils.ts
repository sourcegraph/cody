import type { AuthStatus } from '@sourcegraph/cody-shared'
import semver from 'semver'
import { defaultAuthStatus, unauthenticatedStatus } from './protocol'

/**
 * Checks a user's authentication status.
 * @param endpoint The server endpoint.
 * @param isDotCom Whether the user is connected to the dotcom instance.
 * @param user Whether the user is logged in.
 * @param isEmailVerified Whether the user has verified their email. Default to true for non-enterprise instances.
 * @param isCodyEnabled Whether Cody is enabled on the Sourcegraph instance. Default to true for non-enterprise instances.
 * @param userCanUpgrade Whether the user can upgrade their plan.
 * @param version The Sourcegraph instance version.
 * @param avatarURL The user's avatar URL, or '' if not set.
 * @param username The user's username.
 * @param displayName The user's display name, or '' if not set.
 * @param primaryEmail The user's primary email, or '' if not set.
 * @returns The user's authentication status. It's for frontend to display when instance is on unsupported version if siteHasCodyEnabled is false
 */
export function newAuthStatus(
    endpoint: string,
    isDotCom: boolean,
    user: boolean,
    isEmailVerified: boolean,
    isCodyEnabled: boolean,
    userCanUpgrade: boolean,
    version: string,
    avatarURL: string,
    username: string,
    displayName?: string,
    primaryEmail?: string,
    configOverwrites?: AuthStatus['configOverwrites']
): AuthStatus {
    if (!user) {
        return { ...unauthenticatedStatus, endpoint }
    }
    const authStatus: AuthStatus = { ...defaultAuthStatus, endpoint }
    // Set values and return early
    authStatus.authenticated = user
    authStatus.showInvalidAccessTokenError = !user
    authStatus.requiresVerifiedEmail = isDotCom
    authStatus.hasVerifiedEmail = isDotCom && isEmailVerified
    authStatus.siteHasCodyEnabled = isCodyEnabled
    authStatus.userCanUpgrade = userCanUpgrade
    authStatus.siteVersion = version
    authStatus.avatarURL = avatarURL
    authStatus.primaryEmail = primaryEmail || ''
    authStatus.displayName = displayName || ''
    authStatus.username = username
    if (configOverwrites) {
        authStatus.configOverwrites = configOverwrites
    }
    const isLoggedIn = authStatus.siteHasCodyEnabled && authStatus.authenticated
    const isAllowed = authStatus.requiresVerifiedEmail ? authStatus.hasVerifiedEmail : true
    authStatus.isLoggedIn = isLoggedIn && isAllowed
    authStatus.isDotCom = isDotCom
    authStatus.codyApiVersion = inferCodyApiVersion(version, isDotCom)
    return authStatus
}

/**
 * Counts the number of lines and characters in code blocks in a given string.
 * @param text - The string to search for code blocks.
 * @returns An object with the total lineCount and charCount of code in code blocks,
 * If no code blocks are found, all values are '0'
 */
export const countGeneratedCode = (text: string): { lineCount: number; charCount: number } => {
    const codeBlockRegex = /```[\S\s]*?```/g
    const codeBlocks = text.match(codeBlockRegex)
    if (!codeBlocks) {
        return { charCount: 0, lineCount: 0 }
    }
    const count = { lineCount: 0, charCount: 0 }
    const backticks = '```'
    for (const block of codeBlocks) {
        const lines = block.split('\n')
        const codeLines = lines.filter(line => !line.startsWith(backticks))
        const lineCount = codeLines.length
        const language = lines[0].replace(backticks, '')
        // 2 backticks + 2 newline
        const charCount = block.length - language.length - backticks.length * 2 - 2
        count.charCount += charCount
        count.lineCount += lineCount
    }
    return count
}

function inferCodyApiVersion(version: string, isDotCom: boolean): 0 | 1 {
    const parsedVersion = semver.valid(version)
    // DotCom is always recent
    if (isDotCom) {
        return 1
    }
    // On Cloud deployments from main, the version identifier will not parse as SemVer. Assume these
    // are recent
    if (parsedVersion == null) {
        return 1
    }
    // 5.4.0+ will include the API changes.
    if (semver.gte(parsedVersion, '5.4.0')) {
        return 1
    }
    // Dev instances report as 0.0.0
    if (parsedVersion === '0.0.0') {
        return 1
    }

    return 0 // zero refers to the legacy, unversioned, Cody API
}
