import type { ImportedProviderConfiguration } from '@openctx/client'
import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    type ContextItemOpenCtx,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    PromptString,
    firstValueFrom,
    logDebug,
    parseMentionQuery,
    pendingOperation,
    ps,
} from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { getContextFromRelativePath } from '../../commands/context/file-path'
import { getContextFileFromShell } from '../../commands/context/shell'
import { type ContextRetriever, toStructuredMentions } from '../chat-view/ContextRetriever'
import { getChatContextItemsForMention } from '../context/chatContext'
import { getCorpusContextItemsForEditorState } from '../initialContext'
import { CodyChatMemory } from './CodyChatMemory'
import type { ToolFactory, ToolRegistry } from './CodyToolProvider'

/**
 * Configuration interface for CodyTool instances.
 */
export interface CodyToolConfig {
    tags: {
        tag: PromptString
        subTag: PromptString
    }
    prompt: {
        instruction: PromptString
        placeholder: PromptString
        example: PromptString
    }
}

/**
 * Abstract base class for Cody tools.
 */
export abstract class CodyTool {
    constructor(public readonly config: CodyToolConfig) {}
    /**
     * Generates and returns the instruction prompt string for the tool.
     */
    public getInstruction(): PromptString {
        const { tag, subTag } = this.config.tags
        const { instruction, placeholder } = this.config.prompt
        return ps`${instruction}: \`<${tag}><${subTag}>${placeholder}</${subTag}></${tag}>\``
    }
    /**
     * Parses the raw text input and extracts relevant content.
     */
    protected parse(): string[] {
        const { subTag } = this.config.tags
        const regex = new RegExp(`<${subTag}>(.+?)</?${subTag}>`, 's')
        const parsed = (this.unprocessedText.match(new RegExp(regex, 'g')) || [])
            .map(match => regex.exec(match)?.[1].trim())
            .filter(Boolean) as string[]
        this.reset()
        return parsed
    }
    /**
     * The raw text input stream.
     */
    protected unprocessedText = ''
    /**
     * Appends new text to the existing raw text on stream.
     */
    public stream(text: string): void {
        this.unprocessedText += text
    }
    /**
     * Resets the raw text input stream.
     */
    private reset(): void {
        this.unprocessedText = ''
    }
    /**
     * Optional method to process tool input without executing context retrieval
     */
    public processResponse?(): void
    /**
     * Retrieves context items from the tool's source.
     *
     * Abstract method to be implemented by subclasses for executing the tool.
     */
    public abstract execute(span: Span): Promise<ContextItem[]>
}

/**
 * Tool for executing CLI commands and retrieving their output.
 */
class CliTool extends CodyTool {
    constructor() {
        super({
            tags: {
                tag: ps`TOOLCLI`,
                subTag: ps`cmd`,
            },
            prompt: {
                instruction: ps`To see the output of shell commands - NEVER execute unsafe commands`,
                placeholder: ps`SHELL_COMMAND`,
                example: ps`Details about GitHub issue#1234: \`<TOOLCLI><cmd>gh issue view 1234</cmd></TOOLCLI>\``,
            },
        })
    }

    public async execute(): Promise<ContextItem[]> {
        const commands = this.parse()
        if (commands.length === 0) return []
        logDebug('CodyTool', `executing ${commands.length} commands...`)
        return Promise.all(commands.map(getContextFileFromShell)).then(results => results.flat())
    }
}

/**
 * Tool for retrieving the full content of files in the codebase.
 */
class FileTool extends CodyTool {
    constructor() {
        super({
            tags: {
                tag: ps`TOOLFILE`,
                subTag: ps`name`,
            },
            prompt: {
                instruction: ps`To retrieve full content of a codebase file`,
                placeholder: ps`FILENAME`,
                example: ps`See the content of different files: \`<TOOLFILE><name>path/foo.ts</name><name>path/bar.ts</name></TOOLFILE>\``,
            },
        })
    }

    public async execute(): Promise<ContextItem[]> {
        const filePaths = this.parse()
        if (filePaths.length === 0) return []
        logDebug('CodyTool', `requesting ${filePaths.length} files`)
        return Promise.all(filePaths.map(getContextFromRelativePath)).then(results =>
            results.filter((item): item is ContextItem => item !== null)
        )
    }
}

/**
 * Tool for performing searches within the codebase.
 */
class SearchTool extends CodyTool {
    private performedSearch = new Set<string>()

    constructor(private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {
        super({
            tags: {
                tag: ps`TOOLSEARCH`,
                subTag: ps`query`,
            },
            prompt: {
                instruction: ps`To search for context in the codebase`,
                placeholder: ps`SEARCH_QUERY`,
                example: ps`Locate the "getController" function found in an error log: \`<TOOLSEARCH><query>getController</query></TOOLSEARCH>\``,
            },
        })
    }

    public async execute(span: Span): Promise<ContextItem[]> {
        const queries = this.parse()
        const query = queries.find(q => !this.performedSearch.has(q))
        if (!this.contextRetriever || !query) {
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
        logDebug('CodyTool', `searching codebase for ${query}`)
        const context = await this.contextRetriever.retrieveContext(
            toStructuredMentions([repo]),
            PromptString.unsafe_fromLLMResponse(query),
            span,
            undefined,
            true
        )
        // Store the search query to avoid running the same query again.
        this.performedSearch.add(query)
        const maxSearchItems = 30 // Keep the latest n items and remove the rest.
        const searchQueryItem = {
            type: 'file',
            content: 'Queries performed: ' + Array.from(this.performedSearch).join(', '),
            uri: URI.file('search-history'),
            source: ContextItemSource.Agentic,
            title: 'TOOLCONTEXT',
        } satisfies ContextItem
        context.push(searchQueryItem)
        return context.slice(-maxSearchItems)
    }
}

/**
 * Tool for interacting with OpenCtx providers and retrieving context items.
 */
export class OpenCtxTool extends CodyTool {
    constructor(
        private provider: ImportedProviderConfiguration,
        config: CodyToolConfig
    ) {
        super(config)
    }

    async execute(): Promise<ContextItem[]> {
        const queries = this.parse()
        if (!queries?.length) {
            return []
        }
        logDebug('CodyTool', `searching ${this.provider.providerUri} for "${queries}"`)
        const results: ContextItem[] = []
        const idObject: Pick<ContextMentionProviderMetadata, 'id'> = { id: this.provider.providerUri }
        try {
            for (const query of queries) {
                const mention = parseMentionQuery(query, idObject)
                const items = (await getChatContextItemsForMention({ mentionQuery: mention })).map(
                    mention => {
                        const item = mention as ContextItemOpenCtx
                        const content = item.mention?.description ?? item.mention?.data?.content
                        return { ...item, content, source: ContextItemSource.Agentic }
                    }
                )
                results.push(...items)
            }
            logDebug(
                'CodyTool',
                `${this.provider.provider.meta.name} returned ${results.length} items`,
                { verbose: { results, provider: this.provider.provider } }
            )
        } catch {
            logDebug('CodyTool', `OpenCtx item retrieval failed for ${queries}`)
        }
        return results
    }
}

/**
 * Tool for storing and retrieving temporary memory.
 */
class MemoryTool extends CodyTool {
    constructor() {
        super({
            tags: {
                tag: ps`TOOLMEMORY`,
                subTag: ps`store`,
            },
            prompt: {
                instruction: ps`To persist information across conversations. Write whatever information about the user from the question, or whenever you are asked`,
                placeholder: ps`SUMMARIZED_TEXT`,
                example: ps`To add an item to memory: \`<TOOLMEMORY><store>item</store></TOOLMEMORY>\`\nTo see memory: \`<TOOLMEMORY><store>GET</store></TOOLMEMORY>\``,
            },
        })
    }

    private memoryOnStart = CodyChatMemory.retrieve()

    public async execute(): Promise<ContextItem[]> {
        const storedMemory = this.memoryOnStart
        this.processResponse()
        // Reset the memory after first retrieval to avoid duplication during loop.
        this.memoryOnStart = undefined
        return storedMemory ? [storedMemory] : []
    }

    public processResponse(): void {
        const newMemories = this.parse()
        for (const memory of newMemories) {
            if (memory === 'FORGET') {
                CodyChatMemory.unload()
                return
            }
            if (memory === 'GET') {
                return
            }
            CodyChatMemory.load(memory)
            logDebug('Cody Memory', 'added', { verbose: memory })
        }
    }
}

// Define tools configuration once to avoid repetition
const TOOL_CONFIGS = {
    MemoryTool: { tool: MemoryTool, useContextRetriever: false },
    SearchTool: { tool: SearchTool, useContextRetriever: true },
    CliTool: { tool: CliTool, useContextRetriever: false },
    FileTool: { tool: FileTool, useContextRetriever: false },
} as const

export function getDefaultCodyTools(
    useShellContext: boolean,
    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
    factory: ToolFactory
): CodyTool[] {
    return Object.entries(TOOL_CONFIGS)
        .filter(([name]) => name !== 'CliTool' || useShellContext)
        .map(([name]) => factory.createTool(name, contextRetriever))
        .filter(Boolean) as CodyTool[]
}

export function registerDefaultTools(registry: ToolRegistry): void {
    for (const [name, { tool, useContextRetriever }] of Object.entries(TOOL_CONFIGS)) {
        registry.register({
            name,
            ...tool.prototype.config,
            createInstance: useContextRetriever
                ? (_, contextRetriever) => new tool(contextRetriever)
                : () => new tool(),
        })
    }
}
