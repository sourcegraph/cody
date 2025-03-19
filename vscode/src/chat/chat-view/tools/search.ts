import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    PromptString,
    type UISearchResults,
    UIToolStatus,
    displayPath,
    firstValueFrom,
    pendingOperation,
} from '@sourcegraph/cody-shared'
import type { URI } from 'vscode-uri'
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
                return {
                    text: 'Codebase search failed.',
                    output: { type: 'status', status: UIToolStatus.Error, content: 'Failed' },
                }

            const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
            if (!repo) return { text: 'Codebase search failed - not in valid workspace.' }

            const output = [`Searched '${validInput.query}'`]

            const searches = await contextRetriever.retrieveContext(
                toStructuredMentions([repo]),
                PromptString.unsafe_fromLLMResponse(validInput.query),
                span,
                undefined,
                true
            )

            if (!searches.length) {
                output.push('No results found.')
                return {
                    text: output.join('\n'),
                    output: { type: 'status', status: UIToolStatus.Error, content: output.join('\n') },
                }
            }

            output.push(`Found ${searches.length} results`)

            // Group search results by file name with code content
            const groupedResults = searches
                .map(({ uri, content }) => {
                    if (!content?.length) return ''
                    const remote = !uri.scheme.startsWith('file') && uri.path?.split('/-/blob/')?.pop()
                    const filePath = remote || displayPath(uri)
                    return `\`\`\`${filePath}\n${content}\n\`\`\``
                })
                .join('\n\n')

            output.push(groupedResults)

            return {
                text: output.join('\n'),
                contextItems: searches,
                output: generateSearchToolResults(validInput.query, searches),
            }
        },
    }

    return searchTool
}

function generateSearchToolResults(query: string, items: ContextItem[]): UISearchResults {
    return {
        type: 'search-result',
        status: UIToolStatus.Done,
        query,
        items: items.map(item => ({
            fileName: getFileName(item.uri),
            uri: item.uri,
            lineNumber: createRange(item.range?.start?.line, item.range?.end?.line),
            type: 'code',
        })),
    }
}

// Helper function to create range string - moved outside for better readability
function createRange(startLine?: number, endLine?: number): string {
    if (startLine === undefined && endLine === undefined) {
        return ''
    }
    return `${startLine !== undefined ? startLine + 1 : '0'}-${endLine ?? 'EOF'}`
}

// Helper function to extract file name from URI - moved outside for better readability
function getFileName(uri: URI): string {
    const displayName = displayPath(uri)

    if (!displayName.includes('/-/blob/')) {
        return displayName
    }

    const parts = displayName.split('/-/blob/')
    const result = parts[1] || displayName

    // Remove query parameters if present
    const queryIndex = result.indexOf('?')
    return queryIndex !== -1 ? result.substring(0, queryIndex) : result
}
