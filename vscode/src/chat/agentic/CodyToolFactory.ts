import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    PromptString,
    UIToolStatus,
    isDefined,
    logDebug,
    ps,
} from '@sourcegraph/cody-shared'
import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { URI } from 'vscode-uri'
import { MCPManager } from '../../chat/chat-view/tools/MCPManager'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { CodyTool, type CodyToolConfig, OpenCtxTool, TOOL_CONFIGS } from './CodyTool'
import type { ToolConfiguration } from './CodyToolProvider'
import { toolboxManager } from './ToolboxManager'
import { OPENCTX_TOOL_CONFIG } from './config'

type Retriever = Pick<ContextRetriever, 'retrieveContext'>

/**
 *
/**E
 * ToolFactory manages the creation and registration of Cody tools.
 *
 * Responsibilities:
 * - Maintains a registry of tool configurations
 * - Creates tool instances on demand
 * - Handles both default tools (Search, File, CLI, Memory) and OpenCtx tools
 * - Manages tool configuration and instantiation with proper context
 */
export class ToolFactory {
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

    /**
     * Parse query strings into args object for MCP tool execution
     */
    private parseQueryToArgs(queries: string[], tool: McpTool): Record<string, unknown> {
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
                        for (let i = 1; i < queries.length && i < paramNames.length; i++) {
                            args[paramNames[i]] = queries[i]
                        }
                    }
                } else {
                    // Fallback to using 'query' as the parameter name
                    args = { query: queries[0] }
                }
            }
        }

        return args
    }

    /**
     * Create tool config for MCP tool
     */
    private createMcpToolConfig(tool: McpTool, toolName: string, serverName: string): CodyToolConfig {
        return {
            title: tool.name,
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
            // Add metadata to identify tools from the same MCP server
            metadata: { serverName, isMcpTool: true },
        }
    }

    /**
     * Create a class that extends CodyTool specifically for an MCP tool
     */
    private createMcpToolClass(
        tool: McpTool,
        toolConfig: CodyToolConfig,
        toolName: string,
        serverName: string
    ) {
        return new McpToolImpl(toolConfig, tool, toolName, serverName, this.parseQueryToArgs.bind(this))
    }

    public createMcpTools(mcpTools: McpTool[], serverName: string): CodyTool[] {
        return mcpTools
            .map(tool => {
                const _toolName = tool.name
                // Format to match topic name requirements in bot-response-multiplexer (only digits, letters, hyphens)
                const toolName = `${serverName}-${_toolName}`.replace(/[^\dA-Za-z-]/g, '-')

                // Create a proper tool configuration
                const toolConfig = this.createMcpToolConfig(tool, toolName, serverName)

                // Create the tool instance
                const mcpToolInstance = this.createMcpToolClass(tool, toolConfig, toolName, serverName)

                // Register the tool
                this.register({
                    name: toolName,
                    ...toolConfig,
                    createInstance: () => mcpToolInstance,
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
 * McpToolImpl implements a CodyTool that interfaces with Model Context Protocol tools.
 * It handles the execution of MCP tools and formats their results for display in the UI.
 */
class McpToolImpl extends CodyTool {
    constructor(
        toolConfig: CodyToolConfig,
        private tool: McpTool,
        private toolName: string,
        private serverName: string,
        private parseQueryToArgs: (queries: string[], tool: McpTool) => Record<string, unknown>
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
            const args = this.parseQueryToArgs(queries, this.tool)

            // Get the instance and execute the tool
            const mcpInstance = MCPManager.instance
            if (!mcpInstance) {
                throw new Error('MCP Manager instance not available')
            }

            // Execute the tool and format results
            return await this.executeMcpToolAndFormatResults(
                mcpInstance,
                args,
                this.serverName,
                this.tool.name,
                this.toolName
            )
        } catch (error) {
            return this.handleMcpToolError(error, this.tool.name, this.toolName)
        }
    }

    private async executeMcpToolAndFormatResults(
        mcpInstance: MCPManager,
        args: Record<string, unknown>,
        serverName: string,
        toolName: string,
        displayToolName: string
    ): Promise<ContextItem[]> {
        // Use the MCPManager's executeTool method which properly delegates to serverManager
        const result = await mcpInstance.executeTool(serverName, toolName, args)

        const imageResultInfo = result.context?.some(i => i.type === 'media')
            ? `Image captured for ${JSON.stringify(args)} and will be available for the next request.`
            : ''

        const prefix = `${toolName} tool was executed with ${JSON.stringify(args)} and `

        const statusReport =
            result.status !== UIToolStatus.Error
                ? `completed: ${result?.content || 'invoked'}${imageResultInfo}`
                : `failed: ${result.content}`

        return [
            ...(result.context ?? []),
            {
                type: 'file',
                content: prefix + statusReport,
                uri: URI.parse(`mcp://${displayToolName}-result`),
                source: ContextItemSource.Agentic,
                title: displayToolName,
            },
        ]
    }

    private handleMcpToolError(
        error: unknown,
        toolName: string,
        displayToolName: string
    ): ContextItem[] {
        logDebug('CodyToolProvider', `Error executing ${displayToolName}`, {
            verbose: error,
        })

        const errorStr = error instanceof Error ? error.message : String(error)

        return [
            {
                type: 'file',
                content: `Error executing MCP tool ${toolName}: ${errorStr}`,
                uri: URI.parse(`mcp://$${displayToolName}-error`),
                source: ContextItemSource.Agentic,
                title: displayToolName,
            },
        ]
    }
}
