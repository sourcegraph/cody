import {
    type CodyCommand,
    CodyIDE,
    FeatureFlag,
    type PromptsResult,
    featureFlagProvider,
    graphqlClient,
    isAbortError,
    isErrorLike,
} from '@sourcegraph/cody-shared'
import { FIXTURE_COMMANDS } from '../../webviews/components/promptList/fixtures'
import { getCodyCommandList } from '../commands/CommandsController'
import { getConfiguration } from '../configuration'

/**
 * Observe results of querying the prompts from the Prompt Library, (deprecated) built-in commands,
 * and (deprecated) custom commands. Commands are deprecated in favor of prompts in the Prompt
 * Library.
 */
export async function mergedPromptsAndLegacyCommands(
    query: string,
    signal?: AbortSignal
): Promise<PromptsResult> {
    let promptsValue: PromptsResult['prompts']
    try {
        const prompts = await graphqlClient.queryPrompts(query, signal)
        promptsValue = { type: 'results', results: prompts }
    } catch (error) {
        if (isAbortError(error)) {
            throw error
        }
        const errorMessage = isErrorLike(error) ? error.message : String(error)
        if (errorMessage.startsWith(`Cannot query field "prompts"`)) {
            // Server does not yet support Prompt Library.
            promptsValue = { type: 'unsupported' }
        } else {
            promptsValue = { type: 'error', error: errorMessage }
        }
    }

    const queryLower = query.toLowerCase()
    const isUnifiedPromptsEnabled = await featureFlagProvider.evaluateFeatureFlag(
        FeatureFlag.CodyUnifiedPrompts
    )

    // Ignore commands since with unified prompts vital commands will be replaced by out-of-box
    // commands, see main.ts register cody commands for unified prompts
    if (isUnifiedPromptsEnabled && getConfiguration().agentIDE !== CodyIDE.Web) {
        return {
            query,
            commands: [],
            prompts: promptsValue,
            standardPrompts: [
                {
                    key: 'doc',
                    description: 'Document Code',
                    prompt: '',
                    slashCommand: 'cody.command.document-code',
                    mode: 'ask',
                    type: 'default',
                },
                {
                    key: 'explain',
                    description: 'Explain Code',
                    prompt: '',
                    slashCommand: 'cody.command.explain-code',
                    mode: 'ask',
                    type: 'default',
                },
                {
                    key: 'test',
                    description: 'Generate Unit Tests',
                    prompt: '',
                    slashCommand: 'cody.command.unit-tests',
                    mode: 'ask',
                    type: 'default',
                },
                {
                    key: 'smell',
                    description: 'Find Code Smells',
                    slashCommand: 'cody.command.smell-code',
                    prompt: '',
                    mode: 'ask',
                    type: 'default',
                },
            ] satisfies CodyCommand[],
        }
    }

    const allCommands = [
        ...getCodyCommandList(),
        ...(USE_CUSTOM_COMMANDS_FIXTURE ? FIXTURE_COMMANDS : []),
    ].filter(command => (isUnifiedPromptsEnabled ? { ...command, mode: 'ask' } : command))

    const matchingCommands = allCommands.filter(
        c =>
            matchesQuery(queryLower, c.key) ||
            matchesQuery(queryLower, c.description ?? '') ||
            matchesQuery(queryLower, c.prompt)
    )

    return {
        prompts: promptsValue,
        commands: matchingCommands,
        query,
    }
}

/** For testing only. */
const USE_CUSTOM_COMMANDS_FIXTURE = false

function matchesQuery(query: string, text: string): boolean {
    try {
        return text.toLowerCase().includes(query)
    } catch {
        return false
    }
}
