import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    PromptString,
    firstValueFrom,
    pendingOperation,
} from '@sourcegraph/cody-shared'
import { type ContextRetriever, toStructuredMentions } from '../../chat/chat-view/ContextRetriever'
import { getCorpusContextItemsForEditorState } from '../../chat/initialContext'
import { getContextFromRelativePath } from '../../commands/context/file-path'
import { getContextFileFromShell } from '../../commands/context/shell'

/**
 * A class that contains "tools" that Cody could use during the "reviewing" process.
 */
export class CodyTools {
    constructor(
        private readonly contextRetriever: ContextRetriever,
        private readonly span: Span
    ) {}

    private performedSearch = new Set<string>()

    /**
     * Get the context items from the codebase using the search query provided by Cody.
     */
    async search(queries: string[]): Promise<ContextItem[]> {
        const query = queries[0] // There should only be one query.
        if (!this.contextRetriever || !query || this.performedSearch.has(query)) {
            return []
        }
        // Get the latest corpus context items
        const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
        if (corpusItems === pendingOperation || corpusItems.length === 0) {
            return []
        }
        // Find the first item that represents a repository
        const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
        if (!repo) {
            return []
        }
        const context = await this.contextRetriever.retrieveContext(
            toStructuredMentions([repo]),
            PromptString.unsafe_fromLLMResponse(query),
            this.span
        )
        // Store the search query to avoid running the same query again.
        this.performedSearch.add(query)
        // Limit the number of the new context items to 20 items to avoid long processing time
        // during the next thinking / reflection process.
        return context.slice(-20)
    }

    /**
     * Get the local context items from the current codebase using the file paths requested by Cody.
     */
    async file(filePaths: string[]): Promise<ContextItem[]> {
        return Promise.all(filePaths.map(getContextFromRelativePath)).then(results =>
            results.filter((item): item is ContextItem => item !== null)
        )
    }

    /**
     * Get the output of the commands provided by Cody as context items.
     * NOTE: To be removed in v1.
     */
    async cli(commands: string[]): Promise<ContextItem[]> {
        return Promise.all(commands.map(getContextFileFromShell)).then(results => results.flat())
    }
}
