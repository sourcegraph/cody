import {
    type Action,
    type CommandAction,
    FeatureFlag,
    type PromptAction,
    type PromptsInput,
    type PromptsResult,
    clientCapabilities,
    featureFlagProvider,
    graphqlClient,
    isAbortError,
    isErrorLike,
    isValidVersion, PromptTagsResult,
} from '@sourcegraph/cody-shared'
import { FIXTURE_COMMANDS } from '../../webviews/components/promptList/fixtures'
import { getCodyCommandList } from '../commands/CommandsController'

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
    const { query, recommendedOnly, first, tags, owner, includeViewerDrafts, builtinOnly } = input
    const queryLower = query.toLowerCase()
    const [customPrompts, isUnifiedPromptsEnabled, isNewPromptsSgVersion] = await Promise.all([
        fetchCustomPrompts(queryLower, first, recommendedOnly, signal, tags, owner, includeViewerDrafts, builtinOnly),

        // Unified prompts flag provides prompts-like commands API
        featureFlagProvider.evaluateFeatureFlagEphemerally(FeatureFlag.CodyUnifiedPrompts),

        // 5.10.0 Contains new prompts library API which provides unified prompts
        // and standard (built-in) prompts
        isValidVersion({ minimumVersion: '5.10.0' }),
    ])

    const matchingCommands = await getLocalCommands({
        query: queryLower,
        isUnifiedPromptsEnabled,
        remoteBuiltinPrompts: isNewPromptsSgVersion,
    })

    const actions =
        customPrompts === 'unsupported' ? matchingCommands : [...customPrompts, ...matchingCommands]

    return {
        query,
        actions,
        arePromptsSupported: customPrompts !== 'unsupported',
    }
}

function matchesQuery(query: string, text: string): boolean {
    try {
        return text.toLowerCase().includes(query)
    } catch {
        return false
    }
}

async function fetchCustomPrompts(
    query: string,
    first: number | undefined,
    recommendedOnly: boolean,
    signal: AbortSignal,
    tags?: string[],
    owner?: string,
    includeViewerDrafts?: boolean,
    builtinOnly?: boolean,
): Promise<PromptAction[] | 'unsupported'> {
    try {
        const prompts = await graphqlClient.queryPrompts({ query, first, recommendedOnly, signal, tags, owner, includeViewerDrafts, builtinOnly })
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
