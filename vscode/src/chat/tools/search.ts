import type { Span } from '@opentelemetry/api'
import {
    PromptString,
    displayPath,
    firstValueFrom,
    logDebug,
    pendingOperation,
} from '@sourcegraph/cody-shared'
import { type ContextRetriever, toStructuredMentions } from '../chat-view/ContextRetriever'
import { zodToAnthropicSchema } from '../chat-view/handlers/AgenticHandler'
import { getCorpusContextItemsForEditorState } from '../initialContext'
import type { AgentTool } from './AgentToolGroup'
import { type CodeSearchInput, CodeSearchSchema, validateWithZod } from './schema'

export async function getCodebaseSearchTool(
    contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
    span: Span
): Promise<AgentTool> {
    const searchTool = {
        spec: {
            name: 'code_search',
            description: 'Perform a keyword query search in the codebase.',
            input_schema: zodToAnthropicSchema(CodeSearchSchema),
        },
        invoke: async (input: CodeSearchInput) => {
            const validInput = validateWithZod(CodeSearchSchema, input, 'code_search')
            const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
            if (!corpusItems || corpusItems === pendingOperation) return ''

            const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
            if (!repo) return ''

            logDebug('SearchTool', `searching codebase for ${validInput.query}`)
            const context = await contextRetriever.retrieveContext(
                toStructuredMentions([repo]),
                PromptString.unsafe_fromLLMResponse(validInput.query),
                span,
                undefined,
                true
            )
            return (
                context
                    .map(item => `\`\`\`${displayPath(item.uri)}\n${item.content ?? ''}\n\`\`\``)
                    .join('\n') || ''
            )
        },
    } satisfies AgentTool

    return searchTool
}
