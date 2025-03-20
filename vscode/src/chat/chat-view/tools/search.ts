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
            const validInput = validateWithZod(CodeSearchSchema, input, 'code_search')
            const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
            if (!corpusItems || corpusItems === pendingOperation)
                return createSearchToolStateItem(
                    validInput.query,
                    [],
                    UIToolStatus.Error,
                    'Codebase search failed.'
                )

            const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
            const mentions = repo ? [repo] : []

            const searches = await contextRetriever.retrieveContext(
                toStructuredMentions(mentions),
                PromptString.unsafe_fromLLMResponse(validInput.query),
                span,
                undefined,
                true
            )

            return createSearchToolStateItem(validInput.query, searches)
        },
    }

    return searchTool
}

export function createSearchToolStateItem(
    query: string,
    searchResults: ContextItem[],
    status: UIToolStatus = UIToolStatus.Done,
    error?: string,
    startTime?: number
): ContextItemToolState {
    // Calculate duration if we have a start time
    const duration = startTime ? Date.now() - startTime : undefined

    // Create a virtual URI for this tool state
    const uri = URI.parse(`cody:/tools/search/${query}`)

    // Create a description based on query and result count
    const description = `Search for "${query}" (${searchResults.length} results)\n`

    // Group search results by file name with code content
    const groupedResults = searchResults
        .map(({ uri, content }) => {
            if (!content?.length) return ''
            const remote = !uri.scheme.startsWith('file') && uri.path?.split('/-/blob/')?.pop()
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
        title: 'Search Results',
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
