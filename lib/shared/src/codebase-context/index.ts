import { URI } from 'vscode-uri'

import { languageFromFilename, ProgrammingLanguage } from '../common/languages'
import { type Configuration } from '../configuration'
import { type ActiveTextEditorSelectionRange } from '../editor'
import { type EmbeddingsSearch } from '../embeddings'
import {
    type ContextResult,
    type FilenameContextFetcher,
    type IndexedKeywordContextFetcher,
    type LocalEmbeddingsFetcher,
} from '../local-context'
import { populateCodeContextTemplate, populateMarkdownContextTemplate } from '../prompt/templates'
import { type Message } from '../sourcegraph-api'
import { isDotCom } from '../sourcegraph-api/environments'
import { type EmbeddingsSearchResult } from '../sourcegraph-api/graphql/client'
import { type UnifiedContextFetcher } from '../unified-context'
import { isError } from '../utils'

import {
    getContextMessageWithResponse,
    type ContextFile,
    type ContextFileSource,
    type ContextMessage,
} from './messages'

interface ContextSearchOptions {
    numCodeResults: number
    numTextResults: number
}

export class CodebaseContext {
    constructor(
        private config: Pick<Configuration, 'useContext' | 'experimentalLocalSymbols'>,
        private codebase: string | undefined,
        private getServerEndpoint: () => string,
        public embeddings: EmbeddingsSearch | null,
        private filenames: FilenameContextFetcher | null,
        public localEmbeddings: LocalEmbeddingsFetcher | null,
        public symf?: IndexedKeywordContextFetcher,
        private unifiedContextFetcher?: UnifiedContextFetcher | null,
        private rerank?: (query: string, results: ContextResult[]) => Promise<ContextResult[]>
    ) {}

    public onConfigurationChange(newConfig: typeof this.config): void {
        this.config = newConfig
    }

    /**
     * Returns list of context messages for a given query, sorted in *reverse* order of importance (that is,
     * the most important context message appears *last*)
     */
    public async getContextMessages(query: string, options: ContextSearchOptions): Promise<ContextMessage[]> {
        switch (this.config.useContext) {
            case 'unified':
                return this.getUnifiedContextMessages(query, options)
            case 'keyword':
                return this.getLocalContextMessages(query, options)
            case 'none':
                return []
            default: {
                return this.localEmbeddings || this.embeddings
                    ? this.getEmbeddingsContextMessages(query, options)
                    : this.getLocalContextMessages(query, options)
            }
        }
    }

    // We split the context into multiple messages instead of joining them into a single giant message.
    // We can gradually eliminate them from the prompt, instead of losing them all at once with a single large messeage
    // when we run out of tokens.
    private async getEmbeddingsContextMessages(
        query: string,
        options: ContextSearchOptions
    ): Promise<ContextMessage[]> {
        const combinedResults = await this.getEmbeddingSearchResults(query, options)

        return groupResultsByFile(combinedResults)
            .reverse() // Reverse results so that they appear in ascending order of importance (least -> most).
            .flatMap(groupedResults => CodebaseContext.makeContextMessageWithResponse(groupedResults))
            .map(message => contextMessageWithSource(message, 'embeddings', this.codebase))
    }

    private async getEmbeddingSearchResults(
        query: string,
        options: ContextSearchOptions
    ): Promise<EmbeddingsSearchResult[]> {
        // For dotcom users, only use local embeddings. The remote embeddings impl remains for
        // enterprise users below until it can be replaced by context search, but not for dotcom
        // users as they have a better replacement already (local embeddings).
        if (isDotCom(this.getServerEndpoint())) {
            return this.localEmbeddings?.getContext(query, options.numCodeResults) ?? []
        }

        if (this.embeddings) {
            const embeddingsSearchResults = await this.embeddings.search(
                query,
                options.numCodeResults,
                options.numTextResults
            )
            if (isError(embeddingsSearchResults)) {
                console.error('Error retrieving embeddings:', embeddingsSearchResults)
                return []
            }
            return embeddingsSearchResults.codeResults.concat(embeddingsSearchResults.textResults)
        }
        return []
    }

    public static makeContextMessageWithResponse(groupedResults: {
        file: ContextFile & Required<Pick<ContextFile, 'uri'>>
        results: string[]
    }): ContextMessage[] {
        const contextTemplateFn =
            languageFromFilename(groupedResults.file.uri) === ProgrammingLanguage.Markdown
                ? populateMarkdownContextTemplate
                : populateCodeContextTemplate

        return groupedResults.results.flatMap<Message>(text =>
            getContextMessageWithResponse(
                contextTemplateFn(text, groupedResults.file.uri, groupedResults.file.repoName),
                groupedResults.file
            )
        )
    }

    private async getUnifiedContextMessages(query: string, options: ContextSearchOptions): Promise<ContextMessage[]> {
        if (!this.unifiedContextFetcher) {
            return []
        }

        const results = await this.unifiedContextFetcher.getContext(
            query,
            options.numCodeResults,
            options.numTextResults
        )

        if (isError(results)) {
            console.error('Error retrieving context:', results)
            return []
        }

        const source: ContextFileSource = 'unified'
        return results.flatMap(result => {
            if (result?.type === 'FileChunkContext') {
                const { content, filePath, repoName, revision } = result
                const fileUri = URI.file(filePath)
                const messageText =
                    languageFromFilename(fileUri) === ProgrammingLanguage.Markdown
                        ? populateMarkdownContextTemplate(content, fileUri, repoName)
                        : populateCodeContextTemplate(content, fileUri, repoName)

                return getContextMessageWithResponse(messageText, {
                    type: 'file',
                    uri: fileUri,
                    repoName,
                    revision,
                    source,
                })
            }

            return []
        })
    }

    private async getLocalContextMessages(query: string, options: ContextSearchOptions): Promise<ContextMessage[]> {
        try {
            const filenameResults = await this.getFilenameSearchResults(query, options)
            const rerankedResults = await (this.rerank ? this.rerank(query, filenameResults) : filenameResults)
            const messages = resultsToMessages(rerankedResults)

            return messages
        } catch (error) {
            console.error('Error retrieving local context:', error)
            return []
        }
    }

    private async getFilenameSearchResults(query: string, options: ContextSearchOptions): Promise<ContextResult[]> {
        if (!this.filenames) {
            return []
        }
        const results = await this.filenames.getContext(query, options.numCodeResults + options.numTextResults)
        return results
    }
}

function groupResultsByFile(
    results: EmbeddingsSearchResult[]
): { file: ContextFile & Required<Pick<ContextFile, 'uri'>>; results: string[] }[] {
    const originalFileOrder: (ContextFile & Required<Pick<ContextFile, 'uri'>>)[] = []
    for (const result of results) {
        if (!originalFileOrder.find((ogFile: ContextFile) => ogFile.uri.toString() === result.uri.toString())) {
            originalFileOrder.push({
                uri: result.uri,
                repoName: result.repoName,
                revision: result.revision,
                range: createContextFileRange(result),
                source: 'embeddings',
                type: 'file',
            })
        }
    }

    const resultsGroupedByFile = new Map<string /* resultUri.toString() */, EmbeddingsSearchResult[]>()
    for (const result of results) {
        const results = resultsGroupedByFile.get(result.uri.toString())
        if (results === undefined) {
            resultsGroupedByFile.set(result.uri.toString(), [result])
        } else {
            resultsGroupedByFile.set(result.uri.toString(), results.concat([result]))
        }
    }

    return originalFileOrder.map(file => ({
        file,
        results: mergeConsecutiveResults(resultsGroupedByFile.get(file.uri.toString())!),
    }))
}

function mergeConsecutiveResults(results: EmbeddingsSearchResult[]): string[] {
    const sortedResults = results.sort((a, b) => a.startLine - b.startLine)
    const mergedResults = [results[0].content]

    for (let i = 1; i < sortedResults.length; i++) {
        const result = sortedResults[i]
        const previousResult = sortedResults[i - 1]

        if (result.startLine === previousResult.endLine) {
            mergedResults[mergedResults.length - 1] = mergedResults.at(-1)! + result.content
        } else {
            mergedResults.push(result.content)
        }
    }

    return mergedResults
}

function resultsToMessages(results: ContextResult[]): ContextMessage[] {
    return results.flatMap(({ content, uri, repoName, revision }) => {
        const messageText = populateCodeContextTemplate(content, uri, repoName)
        return getContextMessageWithResponse(messageText, { type: 'file', uri, repoName, revision })
    })
}

function contextMessageWithSource(
    message: ContextMessage,
    source: ContextFileSource,
    codebase?: string
): ContextMessage {
    if (message.file) {
        message.file.source = source
        message.file.repoName = codebase ?? message.file.repoName
    }
    return message
}

function createContextFileRange(result: EmbeddingsSearchResult): ActiveTextEditorSelectionRange {
    return {
        start: {
            line: result.startLine,
            character: 0,
        },
        end: {
            line: result.endLine,
            character: 0,
        },
    }
}
