import type { Span } from '@opentelemetry/api'
import { PromptString, displayPath, firstValueFrom, pendingOperation } from '@sourcegraph/cody-shared'
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
    const searchTool = {
        spec: {
            name: 'code_search',
            description: 'Perform a keyword query search in the codebase.',
            input_schema: zodToolSchema(CodeSearchSchema),
        },
        invoke: async (input: CodeSearchInput) => {
            const validInput = validateWithZod(CodeSearchSchema, input, 'code_search')
            const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
            if (!corpusItems || corpusItems === pendingOperation)
                return { text: 'Codebase search failed.' }

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
                return { text: output.join('\n') }
            }

            output.push(`Found ${searches.length} results`)

            // Only show the last 5 results
            const resultContext = searches.map(({ uri, content }) => {
                if (!content?.length) return ''
                const remote = !uri.scheme.startsWith('file') && uri.path?.split('/-/blob/')?.pop()
                return remote || displayPath(uri)
            })

            output.push(resultContext.join('\n'))

            return { text: output.join('\n'), contextItems: searches.splice(0, searches.length - 5) }
        },
    } satisfies AgentTool

    return searchTool
}
