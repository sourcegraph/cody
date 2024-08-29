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

    const { endpoint, siteVersion, userOrganizations } = options

    const isDotCom_ = isDotCom(endpoint)
    const primaryEmail =
        typeof options.primaryEmail === 'string' ? options.primaryEmail : options.primaryEmail?.email
    const requiresVerifiedEmail = isDotCom_
    const hasVerifiedEmail = requiresVerifiedEmail && options.authenticated && options.hasVerifiedEmail
    const codyApiVersion = inferCodyApiVersion(siteVersion, isDotCom_)
    return {
        ...options,
        endpoint,
        primaryEmail,
        requiresVerifiedEmail,
        hasVerifiedEmail,
        codyApiVersion,
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

type CodyApiVersion = 0 | 1 | 2
// This is an advanced developer setting so it's OK to only read this once and
// require users to reload their windows to debug a problem.
const overriddenApiVersion = vscode.workspace
    .getConfiguration()
    .get<CodyApiVersion | undefined>('cody.advanced.completions-api-version', undefined)

function inferCodyApiVersion(version: string, isDotCom: boolean): CodyApiVersion {
    if (overriddenApiVersion !== undefined) {
        // No need to validate the config, just let it crash. This is an
        // internal setting.
        return overriddenApiVersion
    }
    const parsedVersion = semver.valid(version)
    const isLocalBuild = parsedVersion === '0.0.0'

    if (isDotCom || isLocalBuild) {
        // The most recent version is api-version=2, which was merged on 2024-09-11
        // https://github.com/sourcegraph/sourcegraph/pull/470
        return 2
    }

    // On Cloud deployments from main, the version identifier will use a format
    // like "2024-09-11_5.7-4992e874aee2", which does not parse as SemVer.  We
    // make a best effort go parse the date from the version identifier
    // allowing us to selectively enable new API versions on instances like SG02
    // (that deploy frequently) without crashing on other Cloud deployments that
    // release less frequently.
    const isCloudBuildFromMain = parsedVersion === null
    if (isCloudBuildFromMain) {
        const date = parseDateFromPreReleaseVersion(version)
        if (date && date >= new Date('2024-09-11')) {
            return 2
        }
        // It's safe to bump this up to api-version=2 after the 5.8 release
        return 1
    }

    // 5.8.0+ is the first version to support api-version=2.
    if (semver.gte(parsedVersion, '5.8.0')) {
        return 2
    }

    // 5.4.0+ is the first version to support api-version=1.
    if (semver.gte(parsedVersion, '5.4.0')) {
        return 1
    }

    return 0 // zero refers to the legacy, unversioned, Cody API
}

// Pre-release versions have a format like this "2024-09-11_5.7-4992e874aee2".
// This function return undefined for stable Enterprise releases like "5.7.0".
function parseDateFromPreReleaseVersion(version: string): Date | undefined {
    try {
        const dateString = version.split('_').at(1)
        if (!dateString) {
            return undefined
        }
        return new Date(dateString)
    } catch {
        return undefined
    }
}
