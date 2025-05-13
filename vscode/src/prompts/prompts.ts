import {
    type Action,
    type CommandAction,
    FeatureFlag,
    type PromptAction,
    type PromptTagsResult,
    type PromptsInput,
    type PromptsResult,
    clientCapabilities,
    currentAuthStatus,
    featureFlagProvider,
    graphqlClient,
    isAbortError,
    isErrorLike,
    isValidVersion,
} from '@sourcegraph/cody-shared'
import { FIXTURE_COMMANDS } from '../../webviews/components/promptList/fixtures'
import { getCodyCommandList } from '../commands/CommandsController'
import { getRecentlyUsedPrompts } from './recent'

/** For testing only. */
const USE_CUSTOM_COMMANDS_FIXTURE = false

const STANDARD_PROMPTS_LIKE_COMMAND: CommandAction[] = [
    {
        key: 'edit',
        type: 'default',
        mode: 'ask',
        description: 'Edit Code',
        prompt: 'Start a code edit',
        slashCommand: 'cody.command.edit-code',
        actionType: 'command',
    },
    {
        key: 'doc',
        type: 'default',
        mode: 'ask',
        description: 'Document Code',
        slashCommand: 'cody.command.prompt-document-code',
        prompt: '',
        actionType: 'command',
    },
    {
        key: 'explain',
        type: 'default',
        mode: 'ask',
        description: 'Explain Code',
        slashCommand: 'cody.command.explain-code',
        prompt: '',
        actionType: 'command',
    },
    {
        key: 'test',
        type: 'default',
        mode: 'ask',
        description: 'Generate Unit Tests',
        slashCommand: 'cody.command.unit-tests',
        prompt: '',
        actionType: 'command',
    },
    {
        key: 'smell',
        type: 'default',
        mode: 'ask',
        description: 'Find Code Smells',
        slashCommand: 'cody.command.smell-code',
        prompt: '',
        actionType: 'command',
    },
]

export async function listPromptTags(signal: AbortSignal): Promise<PromptTagsResult> {
    try {
        return await graphqlClient.queryPromptTags({ signal })
    } catch (error) {
        if (isAbortError(error)) {
            throw error
        }

        const errorMessage = isErrorLike(error) ? error.message : String(error)
        if (errorMessage.startsWith(`Cannot query field "promptTags"`)) {
            // Server does not yet support prompt tags.
            return []
        }

        return []
    }
}

/**
 * Merges results  of querying the prompts from the Prompt Library, (deprecated) built-in commands,
 * and (deprecated) custom commands. Commands are deprecated in favor of prompts in the Prompt
 * Library.
 */
export async function mergedPromptsAndLegacyCommands(
    input: PromptsInput,
    signal: AbortSignal
): Promise<PromptsResult> {
    const { query, first = 100, recentlyUsedOnly = false, ...args } = input
    const queryLower = query.toLowerCase()

    // Get recently used prompt IDs
    const auth = currentAuthStatus()
    const recentlyUsedPromptIds = auth.authenticated ? getRecentlyUsedPrompts({ authStatus: auth }) : []

    // Create all promises for parallel execution
    const [recentlyUsedCustomPrompts, customPrompts, isUnifiedPromptsEnabled, isNewPromptsSgVersion] =
        await Promise.all([
            // Fetch recently used prompts
            recentlyUsedPromptIds.length > 0
                ? fetchCustomPrompts({
                      ...args,
                      query: queryLower,
                      first,
                      signal,
                      include: recentlyUsedPromptIds,
                  })
                : Promise.resolve([]),
            // Fetch all custom prompts only if not filtering to recently used
            recentlyUsedOnly
                ? Promise.resolve([])
                : fetchCustomPrompts({
                      ...args,
                      query: queryLower,
                      first,
                      signal,
                  }),
            // Get feature flags
            featureFlagProvider.evaluateFeatureFlagEphemerally(FeatureFlag.CodyUnifiedPrompts),
            // Check version
            isValidVersion({ minimumVersion: '5.10.0' }),
        ])

    const matchingCommands = await getLocalCommands({
        query: queryLower,
        isUnifiedPromptsEnabled,
        remoteBuiltinPrompts: isNewPromptsSgVersion,
    })

    let actions: Action[] = []

    if (customPrompts === 'unsupported' || recentlyUsedCustomPrompts === 'unsupported') {
        actions = matchingCommands
    } else {
        // Use all recently used prompts if filter is enabled, otherwise just the top 3
        const usableRecentPrompts = recentlyUsedOnly
            ? recentlyUsedCustomPrompts
            : recentlyUsedCustomPrompts.slice(0, 3)

        // Only include other prompts if we're not filtering to recently used only
        const otherPrompts = recentlyUsedOnly
            ? []
            : customPrompts.filter(p => !usableRecentPrompts.some(r => r.id === p.id))

        // Combine prompts and commands
        actions = [...usableRecentPrompts, ...otherPrompts, ...matchingCommands].slice(0, first)
    }

    return {
        query,
        actions,
        arePromptsSupported:
            customPrompts !== 'unsupported' && recentlyUsedCustomPrompts !== 'unsupported',
    }
}

function matchesQuery(query: string, text: string): boolean {
    try {
        return text.toLowerCase().includes(query)
    } catch {
        return false
    }
}

interface FetchCustomPromptsArgs {
    query: string
    first: number
    recommendedOnly: boolean
    signal: AbortSignal
    tags?: string[]
    owner?: string
    includeViewerDrafts?: boolean
    builtinOnly?: boolean
    include?: string[]
}

async function fetchCustomPrompts(
    args: FetchCustomPromptsArgs
): Promise<PromptAction[] | 'unsupported'> {
    try {
        const prompts = await graphqlClient.queryPrompts({
            query: args.query,
            first: args.first,
            recommendedOnly: args.recommendedOnly,
            signal: args.signal,
            tags: args.tags,
            owner: args.owner,
            includeViewerDrafts: args.includeViewerDrafts,
            builtinOnly: args.builtinOnly,
            include: args.include,
        })
        return prompts.map(prompt => ({ ...prompt, actionType: 'prompt' }))
    } catch (error) {
        if (isAbortError(error)) {
            throw error
        }

        const errorMessage = isErrorLike(error) ? error.message : String(error)
        if (errorMessage.startsWith(`Cannot query field "prompts"`)) {
            // Server does not yet support Prompt Library.
            return 'unsupported'
        }

        return []
    }
}

interface LocalCommandsInput {
    query: string
    isUnifiedPromptsEnabled: boolean
    remoteBuiltinPrompts: boolean
}

async function getLocalCommands(input: LocalCommandsInput): Promise<Action[]> {
    const { query, isUnifiedPromptsEnabled, remoteBuiltinPrompts } = input

    // Fetch standards (built-in) prompts from prompts library API
    if (remoteBuiltinPrompts) {
        const remoteStandardPrompts = await graphqlClient.queryBuiltinPrompts({ query })
        return remoteStandardPrompts.map(prompt => ({ ...prompt, actionType: 'prompt', builtin: true }))
    }

    // Fallback on local commands (prompts-like or not is controlled by CodyUnifiedPrompts feature flag)
    const codyCommands = getCodyCommandList()
    const allCommands: CommandAction[] = !clientCapabilities().isCodyWeb
        ? // Ignore commands since with unified prompts vital commands will be replaced by out-of-box
          // prompts, see main.ts register cody commands for unified prompts
          isUnifiedPromptsEnabled
            ? STANDARD_PROMPTS_LIKE_COMMAND
            : [...codyCommands, ...(USE_CUSTOM_COMMANDS_FIXTURE ? FIXTURE_COMMANDS : [])].map(c => ({
                  ...c,
                  actionType: 'command',
              }))
        : // Ignore any commands for Cody Web since no commands are supported
          []

    return allCommands.filter(
        c =>
            matchesQuery(query, c.key) ||
            matchesQuery(query, c.description ?? '') ||
            matchesQuery(query, c.prompt)
    )
}
