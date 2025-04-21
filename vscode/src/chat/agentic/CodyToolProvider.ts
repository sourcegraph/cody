import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    type ProcessingStep,
    PromptString,
    type Unsubscribable,
    isDefined,
    logDebug,
    openCtxProviderMetadata,
    openctxController,
    ps,
    switchMap,
} from '@sourcegraph/cody-shared'
import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { map } from 'observable-fns'
import { URI } from 'vscode-uri'
import { MCPManager } from '../../chat/chat-view/tools/MCPManager'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { CodyTool, type CodyToolConfig, OpenCtxTool, TOOL_CONFIGS } from './CodyTool'
import { toolboxManager } from './ToolboxManager'
import { OPENCTX_TOOL_CONFIG } from './config'

type Retriever = Pick<ContextRetriever, 'retrieveContext'>

/**
 * Interface for tool execution status callbacks.
 * Used to track and report tool execution progress.
 */
export interface ToolStatusCallback {
    onUpdate(id: string, content: string): void
    onStream(step: Partial<ProcessingStep>): void
    onComplete(id?: string, error?: Error): void
    onConfirmationNeeded(
        id: string,
        step: Omit<ProcessingStep, 'id' | 'type' | 'state'>
    ): Promise<boolean>
}

/**
 * Configuration interface for registering new tools.
 * Extends CodyToolConfig with name and instance creation function.
 */
export interface ToolConfiguration extends CodyToolConfig {
    name: string
    createInstance: (config: CodyToolConfig, retriever?: Retriever) => CodyTool
}

/**
 * ToolFactory manages the creation and registration of Cody tools.
 *
 * Responsibilities:
 * - Maintains a registry of tool configurations
 * - Creates tool instances on demand
 * - Handles both default tools (Search, File, CLI, Memory) and OpenCtx tools
 * - Manages tool configuration and instantiation with proper context
 */
class ToolFactory {
    private tools: Map<string, ToolConfiguration> = new Map()

    constructor(private contextRetriever: Retriever) {
        // Register default tools
        for (const [name, { tool, useContextRetriever }] of Object.entries(TOOL_CONFIGS)) {
            this.register({
                name,
                ...tool.prototype.config,
                createInstance: useContextRetriever
                    ? (_, contextRetriever) => {
                          if (!contextRetriever) {
                              throw new Error(`Context retriever required for ${name}`)
                          }
                          return new tool(contextRetriever)
                      }
                    : () => new tool(),
            })
        }
    }

    public register(toolConfig: ToolConfiguration): void {
        this.tools.set(toolConfig.name, toolConfig)
    }

    public createTool(name: string, retriever?: Retriever): CodyTool | undefined {
        const config = this.tools.get(name)
        if (!config) {
            return undefined
        }
        const instance = config.createInstance(config, retriever)
        return instance
    }

    public getInstances(): CodyTool[] {
        // Ensure we include all registered tools including MCP tools
        return Array.from(this.tools.entries())
            .filter(([name]) => {
                // Include all tools except CliTool which has special handling
                return name !== 'CliTool' || toolboxManager.getSettings()?.shell?.enabled
            })
            .map(([_, config]) => config.createInstance(config, this.contextRetriever))
            .filter(isDefined)
    }

    public createDefaultTools(contextRetriever?: Retriever): CodyTool[] {
        return Object.entries(TOOL_CONFIGS)
            .map(([name]) => this.createTool(name, contextRetriever))
            .filter(isDefined)
    }

    public createOpenCtxTools(providers: ContextMentionProviderMetadata[]): CodyTool[] {
        return providers
            .map(provider => {
                const toolName = this.generateToolName(provider)
                const config = this.getToolConfig(provider)
                this.register({
                    name: toolName,
                    ...config,
                    createInstance: cfg => new OpenCtxTool(provider, cfg),
                })
                return this.createTool(toolName)
            })
            .filter(isDefined)
    }

    public createMcpTools(mcpTools: McpTool[], serverName: string): CodyTool[] {
        return mcpTools
            .map(tool => {
                // Format to match topic name requirements in bot-response-multiplexer (only digits, letters, hyphens)
                const toolName = `${serverName}-${(tool as any).name as string}`.replace(
                    /[^\dA-Za-z-]/g,
                    '-'
                )
                // Create a proper tool configuration
                const toolConfig: CodyToolConfig = {
                    title: (tool as any).name as string,
                    tags: {
                        tag: PromptString.unsafe_fromUserQuery(toolName),
                        subTag: ps`call`,
                    },
                    prompt: {
                        instruction: PromptString.unsafe_fromUserQuery(
                            ((tool as any).description as string) || ''
                        ),
                        placeholder: ps`ARGS`,
                        examples: [],
                    },
                }

                // Store reference to CodyTool to ensure it's accessible in this scope
                const BaseTool = CodyTool
                // Create a class that extends CodyTool for this MCP tool
                class McpToolInstance extends BaseTool {
                    constructor() {
                        super(toolConfig)
                    }

                    public async execute(span: Span, queries: string[]): Promise<ContextItem[]> {
                        span.addEvent('executeMcpTool')
                        if (!queries.length) {
                            return []
                        }

                        try {
                            // Initialize args object
                            let args: Record<string, unknown> = {}

                            // Process the queries into a proper args object
                            if (queries.length > 0) {
                                try {
                                    // Try to parse as JSON first
                                    const parsedJson = JSON.parse(queries[0])
                                    if (typeof parsedJson === 'object' && parsedJson !== null) {
                                        // If it's a valid object, use it directly
                                        args = parsedJson
                                    } else {
                                        // If it's not an object, use it as a 'value' parameter
                                        args = { value: parsedJson }
                                    }
                                } catch (e) {
                                    // If not valid JSON, treat the query as a string argument
                                    // Extract parameter names from input_schema if available
                                    // Use type assertion since McpTool doesn't have these properties in its type definition
                                    const toolAny = tool as any
                                    const inputSchema = toolAny.input_schema?.properties || {}
                                    const paramNames = Object.keys(inputSchema)

                                    if (paramNames.length > 0) {
                                        // Use the first parameter name from the schema
                                        args = { [paramNames[0]]: queries[0] }

                                        // If there are multiple query strings, try to map them to additional parameters
                                        if (queries.length > 1 && paramNames.length > 1) {
                                            for (
                                                let i = 1;
                                                i < queries.length && i < paramNames.length;
                                                i++
                                            ) {
                                                args[paramNames[i]] = queries[i]
                                            }
                                        }
                                    } else {
                                        // Fallback to using 'query' as the parameter name
                                        args = { query: queries[0] }
                                    }
                                }
                            }

                            // Get the instance and execute the tool
                            const mcpInstance = MCPManager.instance
                            if (!mcpInstance) {
                                throw new Error('MCP Manager instance not available')
                            }

                            // Use the MCPManager's executeTool method which properly delegates to serverManager
                            const result = await mcpInstance.executeTool(
                                serverName,
                                (tool as any).name as string,
                                args
                            )

                            return [
                                {
                                    type: 'file',
                                    content: `${
                                        (tool as any).name
                                    } has been executed successfully. Output from tool: ${
                                        result?.content ?? 'empty'
                                    }`,
                                    uri:
                                        result?.uri ??
                                        URI.file(`mcp-tool-${serverName}-${(tool as any).name}`),
                                    source: ContextItemSource.Agentic,
                                    title: (tool as any).name as string,
                                },
                            ]
                        } catch (error) {
                            logDebug('ToolFactory', `Error executing ${(tool as any).name}`, {
                                verbose: error,
                            })
                            return [
                                {
                                    type: 'file',
                                    content: `Error executing MCP tool ${(tool as any).name}: ${error}`,
                                    uri: URI.file(`mcp-tool-${serverName}-${(tool as any).name}`),
                                    source: ContextItemSource.Agentic,
                                    title: (tool as any).name as string,
                                },
                            ]
                        }
                    }
                }

                // Register the tool
                this.register({
                    name: toolName,
                    ...toolConfig,
                    createInstance: () => new McpToolInstance(),
                })

                return this.createTool(toolName)
            })
            .filter(isDefined)
    }

    private generateToolName(provider: ContextMentionProviderMetadata): string {
        const suffix = provider.id.includes('modelcontextprotocol') ? 'MCP' : ''
        return (
            'TOOL' +
            provider.title
                .split('/')
                .pop()
                ?.replace(/\s+/g, '')
                ?.toUpperCase()
                ?.replace(/[^A-Z0-9]/g, '') +
            suffix
        )
    }

    private getToolConfig(provider: ContextMentionProviderMetadata): CodyToolConfig {
        const defaultConfig = Object.entries(OPENCTX_TOOL_CONFIG).find(
            c => provider.id.toLowerCase().includes(c[0]) || provider.title.toLowerCase().includes(c[0])
        )
        return (
            defaultConfig?.[1] ?? {
                title: provider.title,
                tags: {
                    tag: PromptString.unsafe_fromUserQuery(this.generateToolName(provider)),
                    subTag: ps`get`,
                },
                prompt: {
                    instruction: PromptString.unsafe_fromUserQuery(provider.queryLabel),
                    placeholder: ps`QUERY`,
                    examples: [],
                },
            }
        )
    }
}

/**
 * CodyToolProvider serves as the central manager for all Cody tool functionality.
 *
 * Key Features:
 * 1. Tool Management
 *    - Initializes and maintains the ToolFactory instance
 *    - Provides access to all available tools through getTools()
 *
 * 2. OpenCtx Integration
 *    - Sets up listeners for OpenCtx providers (e.g., web and Linear integrations)
 *    - Dynamically creates tools based on available OpenCtx providers
 *
 * 3. Tool Registry
 *    - Manages registration of default tools (Search, File, CLI, Memory)
 *    - Handles tool configuration and initialization with proper context
 *
 * Usage:
 * - Initialize with context retriever using initialize()
 * - Access tools using getTools()
 * - Set up OpenCtx integration using setupOpenCtxProviderListener()
 */
export class CodyToolProvider {
    public factory: ToolFactory

    private static instance: CodyToolProvider | undefined
    public static configSubscription: Unsubscribable | undefined
    public static openCtxSubscription: Unsubscribable | undefined

    private constructor(contextRetriever: Retriever) {
        this.factory = new ToolFactory(contextRetriever)
    }

    public static initialize(contextRetriever: Retriever): void {
        CodyToolProvider.instance = new CodyToolProvider(contextRetriever)
        CodyToolProvider.setupOpenCtxProviderListener()
    }

    public static getTools(): CodyTool[] {
        return CodyToolProvider.instance?.factory.getInstances() ?? []
    }

    /**
     * Get all tools including dynamically registered ones
     * This ensures MCP tools are properly included in the available tools
     */
    public static getAllTools(): CodyTool[] {
        return CodyToolProvider.getTools()
    }

    /**
     * Register MCP tools from a server
     * @param serverName The name of the MCP server
     * @param tools The list of MCP tools to register
     */
    public static registerMcpTools(serverName: string, tools: McpTool[]): CodyTool[] {
        if (!CodyToolProvider.instance) {
            logDebug('CodyToolProvider', 'Cannot register MCP tools - instance not initialized')
            return []
        }
        logDebug('CodyToolProvider', `Registering ${tools.length} MCP tools from ${serverName}`)
        const createdTools = CodyToolProvider.instance.factory.createMcpTools(tools, serverName)
        logDebug('CodyToolProvider', `Registered ${createdTools.length} MCP tools successfully`)
        return createdTools
    }

    private static setupOpenCtxProviderListener(): void {
        const provider = CodyToolProvider.instance
        if (provider && !CodyToolProvider.configSubscription) {
            CodyToolProvider.configSubscription = toolboxManager.observable.subscribe({})
        }
        if (provider && !CodyToolProvider.openCtxSubscription) {
            CodyToolProvider.openCtxSubscription = openctxController
                .pipe(
                    switchMap(c =>
                        c
                            .metaChanges({}, {})
                            .pipe(
                                map(providers =>
                                    providers.filter(p => !!p.mentions).map(openCtxProviderMetadata)
                                )
                            )
                    )
                )
                .subscribe(providerMeta => provider.factory.createOpenCtxTools(providerMeta))
        }
    }

    public static dispose(): void {
        if (CodyToolProvider.openCtxSubscription) {
            CodyToolProvider.openCtxSubscription.unsubscribe()
            CodyToolProvider.openCtxSubscription = undefined
        }
        CodyToolProvider.configSubscription?.unsubscribe()
        CodyToolProvider.configSubscription = undefined
    }
}

export class TestToolFactory extends ToolFactory {}
