import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    ContextItemSource,
    PromptString,
    UIToolStatus,
    displayPath,
    firstValueFrom,
    pendingOperation,
} from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { URI } from 'vscode-uri'
import type { AgentTool } from '.'
import { getCorpusContextItemsForEditorState } from '../../initialContext'
import { type ContextRetriever, toStructuredMentions } from '../ContextRetriever'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { type CodeSearchInput, CodeSearchSchema } from './schema'

export async function getCodebaseSearchTool(
    contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
    span: Span
): Promise<AgentTool> {
    const searchTool: AgentTool = {
        spec: {
            name: 'code_search',
            description: 'Perform a keyword query search in the codebase.',
            input_schema: zodToolSchema(CodeSearchSchema),
        },
        invoke: async (input: CodeSearchInput) => {
            const startTime = Date.now()
            try {
                const validInput = validateWithZod(CodeSearchSchema, input, 'code_search')
                const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
                if (!corpusItems || corpusItems === pendingOperation) {
                    throw new Error('No corpus items available')
                }

                const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
                const mentions = repo ? [repo] : []

                try {
                    const searches = await contextRetriever.retrieveContext(
                        toStructuredMentions(mentions),
                        PromptString.unsafe_fromLLMResponse(validInput.query),
                        span,
                        // Create a new abort controller that doesn't propagate back
                        new AbortController().signal,
                        true
                    )
                    return createSearchToolStateItem(
                        validInput.query,
                        searches,
                        UIToolStatus.Done,
                        startTime
                    )
                } catch (error) {
                    // Handle error from context retrieval
                    throw new Error(`Context retrieval failed: ${error}`)
                }
            } catch (error) {
                // Handle any other errors
                return createSearchToolStateItem(
                    input.query || 'unknown query',
                    [],
                    UIToolStatus.Error,
                    startTime,
                    `Tool error: ${error}`
                )
            }
        },
    }

    return searchTool
}

export function createSearchToolStateItem(
    query: string,
    searchResults: ContextItem[],
    status: UIToolStatus = UIToolStatus.Done,
    startTime?: number,
    error?: string
): ContextItemToolState {
    // Calculate duration if we have a start time
    const duration = startTime ? Date.now() - startTime : undefined

    // Create a virtual URI for this tool state
    const uri = URI.parse(`cody:/tools/search/${query}`)

    // Create a description based on query and result count
    const description = `Search for "${query}" (${searchResults.length} results)\n`

    // Group search results by file name with code content
    const isRemoteSearch = searchResults.some(r => r?.uri?.scheme === 'http')
    const prefix = isRemoteSearch ? 'Remote search results:\n' : 'Search results:\n'
    const groupedResults =
        prefix +
        searchResults
            .map(({ uri, content }) => {
                if (!content?.length) return ''
                const remote = isRemoteSearch && uri.path?.split('/-/blob/')?.pop()
                const filePath = remote || displayPath(uri)
                return `\`\`\`${filePath}\n${content}\n\`\`\`\n`
            })
            .join('\n\n')

    return {
        type: 'tool-state',
        toolId: `search-${query}`,
        toolName: 'search',
        status,
        duration,
        outputType: 'search-result',
        searchResultItems: searchResults,

        // ContextItemCommon properties
        uri,
        content: description + groupedResults + error,
        title: query,
        description,
        source: ContextItemSource.Agentic,
        icon: 'search',
        metadata: [
            `Query: ${query}`,
            `Results: ${searchResults.length}`,
            `Status: ${status}`,
            ...(duration ? [`Duration: ${duration}ms`] : []),
        ],
    }
}
