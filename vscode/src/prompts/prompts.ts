import { type PromptsResult, graphqlClient, isAbortError, isErrorLike } from '@sourcegraph/cody-shared'
import { FIXTURE_COMMANDS } from '../../webviews/components/promptList/fixtures'
import { getCodyCommandList } from '../commands/CommandsController'

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
    function matchesQuery(text: string): boolean {
        try {
            return text.toLowerCase().includes(queryLower)
        } catch {
            return false
        }
    }

    const allCommands = [
        ...getCodyCommandList(),
        ...(USE_CUSTOM_COMMANDS_FIXTURE ? FIXTURE_COMMANDS : []),
    ]
    const matchingCommands = allCommands.filter(
        c => matchesQuery(c.key) || matchesQuery(c.description ?? '') || matchesQuery(c.prompt)
    )

    return {
        prompts: promptsValue,
        commands: matchingCommands,
        query,
    }
}

/** For testing only. */
const USE_CUSTOM_COMMANDS_FIXTURE = false
