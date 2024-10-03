import {
    type CommandAction,
    FeatureFlag,
    type PromptAction,
    type PromptsResult,
    clientCapabilities,
    featureFlagProvider,
    graphqlClient,
    isAbortError,
    isErrorLike,
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

/**
 * Merges results  of querying the prompts from the Prompt Library, (deprecated) built-in commands,
 * and (deprecated) custom commands. Commands are deprecated in favor of prompts in the Prompt
 * Library.
 */
export async function mergedPromptsAndLegacyCommands(
    query: string,
    signal: AbortSignal
): Promise<PromptsResult> {
    const queryLower = query.toLowerCase()
    const [customPrompts, isUnifiedPromptsEnabled] = await Promise.all([
        fetchCustomPrompts(queryLower, signal),
        featureFlagProvider.evaluateFeatureFlagEphemerally(FeatureFlag.CodyUnifiedPrompts),
    ])

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

    const matchingCommands = allCommands.filter(
        c =>
            matchesQuery(queryLower, c.key) ||
            matchesQuery(queryLower, c.description ?? '') ||
            matchesQuery(queryLower, c.prompt)
    )

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
    signal: AbortSignal
): Promise<PromptAction[] | 'unsupported'> {
    try {
        const prompts = await graphqlClient.queryPrompts(query, signal)
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
