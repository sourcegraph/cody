import {
    type ContextMentionProviderMetadata,
    PromptString,
    isDefined,
    ps,
} from '@sourcegraph/cody-shared'
import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { type CodyTool, McpToolImpl, OpenCtxTool, TOOL_CONFIGS } from './CodyTool'
import { toolboxManager } from './ToolboxManager'
import { OPENCTX_TOOL_CONFIG } from './config'
import type { CodyToolConfig } from './types'

type Retriever = Pick<ContextRetriever, 'retrieveContext'>

/**
 * Configuration interface for registering new tools.
 * Extends CodyToolConfig with name and instance creation function.
 */
interface ToolConfiguration extends CodyToolConfig {
    name: string
    createInstance: (config: CodyToolConfig, retriever?: Retriever) => CodyTool
}

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
     * Create tool config for MCP tool
     */
    private createMcpToolConfig(tool: McpTool, toolName: string, serverName: string): CodyToolConfig {
        return {
            title: tool.name,
            tags: {
                tag: PromptString.unsafe_fromUserQuery(toolName),
                subTag: ps`CALL`,
            },
            prompt: {
                instruction: PromptString.unsafe_fromUserQuery(tool.description || toolName),
                placeholder: PromptString.unsafe_fromUserQuery(JSON.stringify(tool.input_schema)),
                examples: [],
            },
            // Add metadata to identify tools from the same MCP server
            metadata: { serverName, isMcpTool: true },
        }
    }

    public createMcpTools(mcpTools: McpTool[], serverName: string): CodyTool[] {
        return mcpTools
            .map(tool => {
                const _toolName = tool.name
                // Format to match topic name requirements in bot-response-multiplexer (only digits, letters, hyphens)
                const normalizedName = `${serverName}-${_toolName}`.replace(/[^\dA-Za-z-]/g, '-')
                // Create a version that exactly matches what will be used in the XML responses
                const toolName = `TOOL${normalizedName.toUpperCase()}`

                // Create a proper tool configuration
                const toolConfig = this.createMcpToolConfig(tool, toolName, serverName)

                // Register the tool
                this.register({
                    name: toolName,
                    ...toolConfig,
                    createInstance: cfg => new McpToolImpl(cfg, tool, toolName, serverName),
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
