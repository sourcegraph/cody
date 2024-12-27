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
import type { ToolFactory, ToolRegistry, ToolStatusCallback } from './CodyToolProvider'

/**
 * Configuration interface for CodyTool instances.
 */
export interface CodyToolConfig {
    // The title of the tool. For UI display purposes.
    title: string
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

    private static readonly EXECUTION_TIMEOUT_MS = 30000 // 30 seconds
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
    protected abstract execute(span: Span, queries: string[]): Promise<ContextItem[]>
    public async run(span: Span, callback?: ToolStatusCallback): Promise<ContextItem[]> {
        try {
            const queries = this.parse()
            if (queries.length) {
                callback?.onToolStream(this.config.title, queries.join(', '))
                // Create a timeout promise
                const timeoutPromise = new Promise<ContextItem[]>((_, reject) => {
                    setTimeout(() => {
                        reject(
                            new Error(
                                `${this.config.title} execution timed out after ${CodyTool.EXECUTION_TIMEOUT_MS}ms`
                            )
                        )
                    }, CodyTool.EXECUTION_TIMEOUT_MS)
                })
                // Race between execution and timeout
                const results = await Promise.race([this.execute(span, queries), timeoutPromise])
                // Notify that tool execution is complete
                callback?.onToolExecuted(this.config.title)
                return results
            }
        } catch (error) {
            callback?.onToolError(this.config.title, error as Error)
        }
        return Promise.resolve([])
    }
}

/**
 * Tool for executing CLI commands and retrieving their output.
 */
class CliTool extends CodyTool {
    constructor() {
        super({
            title: 'Terminal',
            tags: {
                tag: ps`TOOLCLI`,
                subTag: ps`cmd`,
            },
            prompt: {
                instruction: ps`To see the output of shell commands - Do not suggest any actions that may cause harm or security breaches. Limit to actions that are safe to perform. Follow these guidelines for all operations: Commands must be single, atomic operations. Commands must have explicit, validated parameters. Reject commands containing shell metacharacters (;|&$><\`). Reject commands with string concatenation or interpolation. Reject commands containing paths outside of the current working directory. Reject commands that make network requests. Reject commands that could enable privilege escalation. Reject commands containing GTFOBin-like shell escapes. Reject commands that modify system files or settings. Reject commands that access sensitive files. Reject commands that read environment variables.`,
                placeholder: ps`SHELL_COMMAND`,
                example: ps`Get output for git diff: \`<TOOLCLI><cmd>git diff</cmd></TOOLCLI>\`. Never execute destructive commands: \`<TOOLCLI><ban>rm -rf /</ban></TOOLCLI>\`. Never execute commands with string interpolation: \`<TOOLCLI><ban>echo $HOME</ban></TOOLCLI>\`. Never execute commands that make network connections: \`<TOOLCLI><ban>ssh user@host</ban></TOOLCLI>\``,
            },
        })
    }

    public async execute(span: Span, commands: string[]): Promise<ContextItem[]> {
        span.addEvent('executeCliTool')
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
            title: 'File',
            tags: {
                tag: ps`TOOLFILE`,
                subTag: ps`name`,
            },
            prompt: {
                instruction: ps`To retrieve full content of a codebase file-DO NOT retrieve files that may contain secrets`,
                placeholder: ps`FILENAME`,
                example: ps`See the content of different files: \`<TOOLFILE><name>path/foo.ts</name><name>path/bar.ts</name></TOOLFILE>\``,
            },
        })
    }

    public async execute(span: Span, filePaths: string[]): Promise<ContextItem[]> {
        span.addEvent('executeFileTool')
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
            title: 'Code Search',
            tags: {
                tag: ps`TOOLSEARCH`,
                subTag: ps`query`,
            },
            prompt: {
                instruction: ps`To search for context in the codebase`,
                placeholder: ps`SEARCH_QUERY`,
                example: ps`Locate the "getController" function found in an error log: \`<TOOLSEARCH><query>getController</query></TOOLSEARCH>\`\nSearch for a function in a file: \`<TOOLSEARCH><query>getController file:controller.py</query></TOOLSEARCH>\``,
            },
        })
    }

    public async execute(span: Span, queries: string[]): Promise<ContextItem[]> {
        span.addEvent('executeSearchTool')
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
        logDebug('SearchTool', `searching codebase for ${query}`)
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

    async execute(span: Span, queries: string[]): Promise<ContextItem[]> {
        span.addEvent('executeOpenCtxTool')
        if (!queries?.length) {
            return []
        }
        logDebug('OpenCtxTool', `searching ${this.provider.providerUri} for "${queries}"`)
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
        CodyChatMemory.initialize()
        super({
            title: 'Cody Memory',
            tags: {
                tag: ps`TOOLMEMORY`,
                subTag: ps`store`,
            },
            prompt: {
                instruction: ps`Add any information about the user's preferences (e.g. their preferred tool or language) based on the question, or when asked`,
                placeholder: ps`SUMMARIZED_TEXT`,
                example: ps`To add an item to memory: \`<TOOLMEMORY><store>item</store></TOOLMEMORY>\`\nTo see memory: \`<TOOLMEMORY><store>GET</store></TOOLMEMORY>\`\nTo clear memory: \`<TOOLMEMORY><store>FORGET</store></TOOLMEMORY>\``,
            },
        })
    }

    private memoryOnStart = CodyChatMemory.retrieve()

    public async execute(span: Span): Promise<ContextItem[]> {
        span.addEvent('executeMemoryTool')
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
    isShellContextEnabled: boolean,
    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
    factory: ToolFactory
): CodyTool[] {
    return Object.entries(TOOL_CONFIGS)
        .filter(([name]) => name !== 'CliTool' || isShellContextEnabled)
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
