import semver from 'semver'
import * as vscode from 'vscode'

import { type AuthStatus, type AuthenticatedAuthStatus, isDotCom } from '@sourcegraph/cody-shared'
import type { CurrentUserInfo } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

type NewAuthStatusOptions = { endpoint: string } & (
    | { authenticated: false; showNetworkError?: boolean; showInvalidAccessTokenError?: boolean }
    | (Pick<
          AuthenticatedAuthStatus,
          | 'authenticated'
          | 'username'
          | 'siteVersion'
          | 'configOverwrites'
          | 'hasVerifiedEmail'
          | 'displayName'
          | 'avatarURL'
          | 'userCanUpgrade'
          | 'isOfflineMode'
      > & {
          userOrganizations?: CurrentUserInfo['organizations']
          primaryEmail?:
              | string
              | {
                    email: string
                }
              | null
      })
)

export function newAuthStatus(options: NewAuthStatusOptions): AuthStatus {
    if (!options.authenticated) {
        return { authenticated: false, endpoint: options.endpoint, showInvalidAccessTokenError: true }
    }

    const { isOfflineMode, username, endpoint, siteVersion, userOrganizations } = options

    if (isOfflineMode) {
        return {
            authenticated: true,
            endpoint,
            username,
            codyApiVersion: 0,
            siteVersion: 'offline',
            isOfflineMode: true,
        }
    }

    const isDotCom_ = isDotCom(endpoint)
    const primaryEmail =
        typeof options.primaryEmail === 'string' ? options.primaryEmail : options.primaryEmail?.email
    const requiresVerifiedEmail = isDotCom_
    const hasVerifiedEmail = requiresVerifiedEmail && options.authenticated && options.hasVerifiedEmail
    return {
        ...options,
        endpoint,
        primaryEmail,
        requiresVerifiedEmail,
        hasVerifiedEmail,
        codyApiVersion: inferCodyApiVersion(siteVersion, isDotCom_),
        isFireworksTracingEnabled:
            isDotCom_ && !!userOrganizations?.nodes.find(org => org.name === 'sourcegraph'),
    }
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

// This is an advanced developer setting so it's OK to only read this once and
// require users to reload their windows to debug a problem.
const overridenApiVersion = vscode.workspace
    .getConfiguration()
    .get<0 | 1 | 2 | undefined>('cody.advanced.api-version', undefined)

function inferCodyApiVersion(version: string, isDotCom: boolean): 0 | 1 | 2 {
    if (overridenApiVersion !== undefined) {
        // No need to validate the config, just let it crash. This is a developer setting.
        return overridenApiVersion
    }
    const mostRecentVersion = 2
    const parsedVersion = semver.valid(version)
    // DotCom is always recent
    if (isDotCom) {
        return mostRecentVersion
    }
    // On Cloud deployments from main, the version identifier will not parse as SemVer. Assume these
    // are recent
    if (parsedVersion == null) {
        return mostRecentVersion
    }
    // 5.8.0+ will include the API changes.
    if (semver.gte(parsedVersion, '5.8.0')) {
        return 2
    }
    // 5.4.0+ will include the API changes.
    if (semver.gte(parsedVersion, '5.4.0')) {
        return 1
    }
    // Dev instances report as 0.0.0
    if (parsedVersion === '0.0.0') {
        return mostRecentVersion
    }

    return 0 // zero refers to the legacy, unversioned, Cody API
}
