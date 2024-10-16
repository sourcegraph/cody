import { type AuthStatus, type AuthenticatedAuthStatus, isDotCom } from '@sourcegraph/cody-shared'
import type { CurrentUserInfo } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

type NewAuthStatusOptions = { endpoint: string } & (
    | { authenticated: false; showNetworkError?: boolean; showInvalidAccessTokenError?: boolean }
    | (Pick<
          AuthenticatedAuthStatus,
          'authenticated' | 'username' | 'hasVerifiedEmail' | 'displayName' | 'avatarURL'
      > & {
          organizations?: CurrentUserInfo['organizations']
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
        return {
            authenticated: false,
            endpoint: options.endpoint,
            showInvalidAccessTokenError: true,
            pendingValidation: false,
        }
    }

    const { endpoint, organizations } = options

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
        pendingValidation: false,
        isFireworksTracingEnabled:
            isDotCom_ && !!organizations?.nodes.find(org => org.name === 'sourcegraph'),
        organizations: organizations?.nodes,
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
