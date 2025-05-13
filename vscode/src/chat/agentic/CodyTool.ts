import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    ContextItemSource,
    type ContextItemWithContent,
    type ContextMentionProviderMetadata,
    ProcessType,
    PromptString,
    UIToolStatus,
    currentOpenCtxController,
    firstValueFrom,
    logDebug,
    parseMentionQuery,
    pendingOperation,
    ps,
} from '@sourcegraph/cody-shared'
import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import * as uuid from 'uuid'
import { URI } from 'vscode-uri'
import { getContextFromRelativePath } from '../../commands/context/file-path'
import { getContextFileFromShell } from '../../commands/context/shell'
import { type ContextRetriever, toStructuredMentions } from '../chat-view/ContextRetriever'
import { MCPManager } from '../chat-view/tools/MCPManager'
import { getChatContextItemsForMention } from '../context/chatContext'
import { getCorpusContextItemsForEditorState } from '../initialContext'
import { CodyChatMemory } from './CodyChatMemory'
import { RawTextProcessor } from './DeepCody'
import type { CodyToolConfig, ICodyTool, ToolStatusCallback } from './types'

/**
 * Abstract base class for Cody tools.
 */
export abstract class CodyTool implements ICodyTool {
    protected readonly performedQueries = new Set<string>()
    constructor(public readonly config: CodyToolConfig) {}

    private static readonly EXECUTION_TIMEOUT_MS = 30000 // 30 seconds
    /**
     * Generates and returns the instruction prompt string for the tool.
     */
    public getInstruction(): PromptString {
        const { tag, subTag } = this.config.tags
        const { instruction, placeholder, examples } = this.config.prompt
        try {
            const prompt = ps`\`<${tag}><${subTag}>${placeholder}</${subTag}></${tag}>\`: ${instruction}.`
            if (!examples?.length) {
                return prompt
            }
            return ps`${prompt}\n\t- ${RawTextProcessor.join(examples, ps`\n\t- `)}`
        } catch (error) {
            logDebug('Cody Tool', `failed to getInstruction for ${tag}`, { verbose: { error } })
            return ps``
        }
    }
    /**
     * Parses the raw text input and extracts relevant content.
     */
    protected parse(): string[] {
        const { subTag } = this.config.tags
        const regex = new RegExp(`<${subTag}>(.+?)</?${subTag}>`, 'gs')
        // Use matchAll for more efficient iteration and destructuring
        const newQueries = [...this.unprocessedText.matchAll(regex)]
            .map(([, group]) => group?.trim())
            .filter(query => query && !this.performedQueries.has(query))
        // Add all new queries to the set at once
        for (const query of newQueries) {
            this.performedQueries.add(query)
        }
        this.reset()
        return newQueries
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
    public abstract execute(
        span: Span,
        queries: string[],
        callback?: ToolStatusCallback
    ): Promise<ContextItem[]>
    public async run(span: Span, cb?: ToolStatusCallback): Promise<ContextItem[]> {
        const toolID = this.config.tags.tag.toString()
        try {
            const queries = this.parse()
            if (queries.length) {
                cb?.onStream({
                    id: toolID,
                    title: this.config.title,
                    content: queries.join(', '),
                    type: ProcessType.Tool,
                })
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
                const results = await Promise.race([this.execute(span, queries, cb), timeoutPromise])
                // Notify that tool execution is complete
                cb?.onComplete(toolID)
                return results
            }
        } catch (error) {
            cb?.onComplete(toolID, error as Error)
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
                instruction: ps`Execute safe command-line instructions.`,
                placeholder: ps`SAFE_COMMAND`,
                examples: [
                    ps`Get output for git diff: \`<TOOLCLI><cmd>git diff</cmd></TOOLCLI>\``,
                    ps`List files in a directory: \`<TOOLCLI><cmd>ls -l</cmd></TOOLCLI>\``,
                ],
            },
        })
    }

    public async execute(
        span: Span,
        commands: string[],
        callback: ToolStatusCallback
    ): Promise<ContextItem[]> {
        span.addEvent('executeCliTool')
        if (commands.length === 0) return []
        const toolID = this.config.tags.tag.toString()
        const approvedCommands = new Set<string>()
        for (const command of commands) {
            const stepId = `${toolID}-${uuid.v4()}`
            const apporval = await callback?.onConfirmationNeeded(stepId, {
                title: this.config.title,
                content: command,
            })
            if (apporval) {
                approvedCommands.add(command)
            } else {
                callback.onComplete(stepId, new Error('Command rejected'))
            }
        }
        if (!approvedCommands.size) {
            throw new Error('No commands approved for execution')
        }
        callback.onUpdate(toolID, [...approvedCommands].join(', '))
        logDebug('CodyTool', `executing ${approvedCommands.size} commands...`)
        return Promise.all([...approvedCommands].map(getContextFileFromShell)).then(results =>
            results.flat()
        )
    }
}

/**
 * Tool for retrieving the full content of files in the codebase.
 */
class FileTool extends CodyTool {
    constructor() {
        super({
            title: 'Codebase File',
            tags: {
                tag: ps`TOOLFILE`,
                subTag: ps`name`,
            },
            prompt: {
                instruction: ps`To retrieve full content of a codebase file-DO NOT retrieve files that may contain secrets`,
                placeholder: ps`FILENAME`,
                examples: [
                    ps`See the content of different files: \`<TOOLFILE><name>path/foo.ts</name><name>path/bar.ts</name></TOOLFILE>\``,
                ],
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
    constructor(private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {
        super({
            title: 'Code Search',
            tags: {
                tag: ps`TOOLSEARCH`,
                subTag: ps`query`,
            },
            prompt: {
                instruction: ps`Perform a symbol query search in the codebase (Natural language search NOT supported)`,
                placeholder: ps`SEARCH_QUERY`,
                examples: [
                    ps`Locate a symbol found in an error log: \`<TOOLSEARCH><query>symbol name</query></TOOLSEARCH>\``,
                    ps`Search for a function named getController: \`<TOOLSEARCH><query>getController</query></TOOLSEARCH>\``,
                ],
            },
        })
    }

    public async execute(span: Span, queries: string[]): Promise<ContextItem[]> {
        span.addEvent('executeSearchTool')
        // TODO: Check if it makes sense to do a search on all queries or just the first one.
        const query = queries[0]
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
        const maxSearchItems = 30 // Keep the latest n items and remove the rest.
        const searchQueryItem = {
            type: 'file',
            content: 'Queries performed: ' + Array.from(this.performedQueries).join(', '),
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
        private provider: ContextMentionProviderMetadata,
        config: CodyToolConfig
    ) {
        super(config)
    }

    async execute(span: Span, queries: string[]): Promise<ContextItem[]> {
        span.addEvent('executeOpenCtxTool')
        const openCtxClient = currentOpenCtxController()
        if (!queries?.length || !openCtxClient) {
            return []
        }
        const results: ContextItem[] = []
        const idObject: Pick<ContextMentionProviderMetadata, 'id'> = { id: this.provider.id }
        try {
            // TODO: Investigate if we can batch queries for better performance.
            // For example, would it cause issues if we fire 10 requests to a OpenCtx provider for fetching Linear?
            for (const query of queries) {
                const mention = parseMentionQuery(query, idObject)
                // First get the items without content
                const openCtxItems = await getChatContextItemsForMention({ mentionQuery: mention })
                // Then resolve content for each item using OpenCtx controller
                const itemsWithContent = await Promise.all(
                    openCtxItems.map(async item => {
                        if (item.type === 'openctx' && item.mention) {
                            const mention = {
                                ...item.mention,
                                title: item.title,
                            }
                            const items = await openCtxClient.items(
                                { message: query, mention },
                                { providerUri: item.providerUri }
                            )
                            return items
                                .map(
                                    (item): (ContextItemWithContent & { providerUri: string }) | null =>
                                        item.ai?.content
                                            ? {
                                                  type: 'openctx',
                                                  title: item.title,
                                                  uri: URI.parse(item.url || item.providerUri),
                                                  providerUri: item.providerUri,
                                                  content: item.ai.content,
                                                  provider: 'openctx',
                                                  source: ContextItemSource.Agentic,
                                              }
                                            : null
                                )
                                .filter(context => context !== null) as ContextItemWithContent[]
                        }
                        return item
                    })
                )
                results.push(...itemsWithContent.flat())
            }
            logDebug('OpenCtxTool', `${this.provider.title} returned ${results.length} items`, {
                verbose: { results, provider: this.provider.title },
            })
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
                instruction: ps`Add info about the user and their preferences (e.g. name, preferred tool, language etc) based on the question, or when asked. DO NOT store summarized questions. DO NOT clear memory unless requested`,
                placeholder: ps`SUMMARIZED_TEXT`,
                examples: [
                    ps`Add user info to memory: \`<TOOLMEMORY><store>info</store></TOOLMEMORY>\``,
                    ps`Get the stored user info: \`<TOOLMEMORY><store>GET</store></TOOLMEMORY>\``,
                    ps`ONLY clear memory ON REQUEST: \`<TOOLMEMORY><store>FORGET</store></TOOLMEMORY>\``,
                ],
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

/**
 * McpToolImpl implements a CodyTool that interfaces with Model Context Protocol tools.
 * It handles the execution of MCP tools and formats their results for display in the UI.
 */
export class McpToolImpl extends CodyTool {
    constructor(
        toolConfig: CodyToolConfig,
        private tool: McpTool,
        private toolName: string,
        private serverName: string
    ) {
        super(toolConfig)
    }

    public async execute(span: Span, queries: string[]): Promise<ContextItem[]> {
        span.addEvent('executeMcpTool')
        if (!queries.length) {
            return []
        }

        try {
            // Parse queries into args object
            const args = this.parseQueryToArgs(queries)
            // Execute the tool and format results
            return await this.executeMcpToolAndFormatResults(args, this.serverName)
        } catch (error) {
            return this.handleMcpToolError(error)
        }
    }

    private async executeMcpToolAndFormatResults(
        args: Record<string, unknown>,
        serverName: string
    ): Promise<ContextItem[]> {
        // Get the instance and execute the tool
        const mcpInstance = MCPManager.instance
        if (!mcpInstance) {
            throw new Error('MCP Manager instance not available')
        }

        // Use the MCPManager's executeTool method which properly delegates to serverManager
        const result = await mcpInstance.executeTool(serverName, this.tool.name, args)

        const prefix = `${this.tool.name} tool was executed with ${JSON.stringify(args)} and `

        const statusReport =
            result.status !== UIToolStatus.Error
                ? `completed: ${result?.content || 'invoked'}`
                : `failed: ${result.content}`

        return [
            ...(result.context ?? []),
            {
                type: 'file',
                content: prefix + statusReport,
                uri: URI.parse(`mcp://${this.tool.name}-result`),
                source: ContextItemSource.Agentic,
                title: this.toolName,
            },
        ]
    }

    private handleMcpToolError(error: unknown): ContextItem[] {
        const displayToolName = this.toolName || this.tool.name
        logDebug('CodyToolProvider', `Error executing ${displayToolName}`, {
            verbose: error,
        })

        const errorStr = error instanceof Error ? error.message : String(error)

        return [
            {
                type: 'file',
                content: `Error executing MCP tool ${this.tool.name}: ${errorStr}`,
                uri: URI.parse(`mcp://$${displayToolName}-error`),
                source: ContextItemSource.Agentic,
                title: displayToolName,
            },
        ]
    }

    /**
     * Parse query strings into args object for MCP tool execution
     */
    private parseQueryToArgs(queries: string[]): Record<string, unknown> {
        // Extract parameter names from input_schema if available
        const inputSchema = this.tool.input_schema
        const paramNames = Object.keys(inputSchema)
        const args: Record<string, unknown> = {}

        if (paramNames.length > 0) {
            // Map each query to each parameter name in order
            for (let i = 0; i < queries.length && i < paramNames.length; i++) {
                try {
                    // First try to parse as a direct JSON object
                    let parsedValue: unknown
                    try {
                        parsedValue = JSON.parse(queries[i])
                    } catch (e) {
                        // If direct parsing fails, treat as a string
                        parsedValue = queries[i]
                    }

                    // If the parsed value is an object and this is the first parameter,
                    // and we're dealing with an object schema, spread its properties
                    if (
                        i === 0 &&
                        typeof parsedValue === 'object' &&
                        parsedValue !== null &&
                        inputSchema.type === 'object'
                    ) {
                        Object.assign(args, parsedValue)
                    } else {
                        // Otherwise assign to the parameter directly
                        args[paramNames[i]] = parsedValue
                    }
                } catch (e) {
                    // Fallback to using the original string
                    args[paramNames[i]] = queries[i]
                }
            }
        } else if (queries.length > 0) {
            // Fallback to using 'query' as the parameter name
            try {
                // First try to parse as JSON
                try {
                    const parsedValue = JSON.parse(queries[0])

                    // If it's an object, use its properties directly for a more flexible interface
                    if (typeof parsedValue === 'object' && parsedValue !== null) {
                        Object.assign(args, parsedValue)
                    } else {
                        args.query = parsedValue
                    }
                } catch (e) {
                    // If parsing fails, use the original string
                    args.query = queries[0]
                }
            } catch (e) {
                args.query = queries[0]
            }
        }

        return args
    }
}

// Define tools configuration once to avoid repetition
export const TOOL_CONFIGS = {
    MemoryTool: { tool: MemoryTool, useContextRetriever: false },
    SearchTool: { tool: SearchTool, useContextRetriever: true },
    CliTool: { tool: CliTool, useContextRetriever: false },
    FileTool: { tool: FileTool, useContextRetriever: false },
} as const
