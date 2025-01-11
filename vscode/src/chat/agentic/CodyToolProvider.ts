import { PromptString, authStatus, firstValueFrom, isDefined, ps } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getOpenCtxProviders } from '../../context/openctx'
import { createModelContextProvider } from '../../context/openctx/modelContextProvider'
import type { OpenCtxProvider } from '../../context/openctx/types'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import {
    type CodyTool,
    type CodyToolConfig,
    ModelContextProviderTool,
    OpenCtxTool,
    getDefaultCodyTools,
    registerDefaultTools,
} from './CodyTool'
interface CodyShellConfig {
    user?: boolean
    instance?: boolean
    client?: boolean
}

export interface ToolStatusCallback {
    onStart(): void
    onStream(tool: string, content: string): void
    onComplete(tool?: string, error?: Error): void
}

/**
 * CodyToolProvider is a singleton class responsible for managing and providing access to various Cody tools.
 * It handles both default tools and OpenContext-based tools (like web and Linear integrations).
 *
 * Key responsibilities:
 * - Maintains a registry of available tools through ToolFactory
 * - Initializes and manages default Cody tools
 * - Manages OpenContext tools for external integrations
 * - Provides a unified interface to access all available tools
 */
export class CodyToolProvider {
    private openCtxTools: CodyTool[] = []
    private modelContextProviderTools: CodyTool[] = []
    private toolFactory = new ToolFactory()
    private shellConfig: CodyShellConfig = {
        user: false,
        instance: false,
        client: false,
    }

    private constructor(private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {
        this.initializeToolRegistry()
        this.initializeOpenCtxTools()
        this.initializeModelContextProviderTools()
    }

    public static instance(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    ): CodyToolProvider {
        return new CodyToolProvider(contextRetriever)
    }

    private initializeToolRegistry(): void {
        registerDefaultTools(this.toolFactory.registry)
    }

    public setShellConfig(config: CodyShellConfig): void {
        // merge the new config into the old config
        const newConfig = { ...this.shellConfig, ...config }
        this.shellConfig = newConfig
    }

    public get isShellEnabled(): boolean {
        return Boolean(this.shellConfig.client && this.shellConfig.instance && this.shellConfig.user)
    }

    public getTools(): CodyTool[] {
        const defaultTools = getDefaultCodyTools(
            this.isShellEnabled,
            this.contextRetriever,
            this.toolFactory
        )
        return [...defaultTools, ...this.openCtxTools, ...this.modelContextProviderTools]
    }

    private async initializeOpenCtxTools(): Promise<void> {
        this.openCtxTools = await this.buildOpenCtxCodyTools()
    }

    private async initializeModelContextProviderTools(): Promise<void> {
        const modelcontextprotocoltoolsEnabled = vscode.workspace
            .getConfiguration()
            .get<boolean>('openctx.mcp.enable')
        const modelcontextprotocoltoolsURI = vscode.workspace
            .getConfiguration()
            .get<string>('openctx.mcp.uri')

        const modelcontextprotocoltoolNameQuery =
            vscode.workspace.getConfiguration().get<string>('openctx.mcp.nameQuery') || ''
        if (!modelcontextprotocoltoolsEnabled || !modelcontextprotocoltoolsURI) {
            return
        }
        const modelContextProvider = await createModelContextProvider(modelcontextprotocoltoolsURI)
        await modelContextProvider.meta({}, {})
        this.modelContextProviderTools = await this.buildModelContextProviderTools(
            modelContextProvider,
            modelcontextprotocoltoolNameQuery
        )
    }

    private async buildModelContextProviderTools(
        modelContextProvider: OpenCtxProvider,
        modelcontextprotocoltoolNameQuery: string
    ): Promise<CodyTool[]> {
        const mentions = await modelContextProvider.mentions?.(
            { query: modelcontextprotocoltoolNameQuery },
            {}
        )
        if (!mentions?.length) {
            return []
        }

        return mentions
            .map(mention => {
                const toolName = `MCP-${mention.title}`
                const upperTitle = mention.title.toUpperCase()
                const tagName = `${upperTitle}TOOL`

                // Create config in OPENCTX_CONFIG format
                const config = {
                    title: `${mention.title} (via MCP)`,
                    tags: {
                        tag: PromptString.unsafe_fromUserQuery(tagName),
                        subTag: ps`QUERY`, // This helps differentiate between them so I will add a subtag
                    },
                    prompt: {
                        instruction: PromptString.unsafe_fromUserQuery(
                            `Use ${mention.title} to ${mention.description || 'retrieve context'}. ` +
                                `Input must follow this schema: ${JSON.stringify(
                                    mention.data?.properties,
                                    null,
                                    2
                                )}` +
                                'Ensure all required properties are provided and types match the schema.'
                        ),
                        placeholder: PromptString.unsafe_fromUserQuery(
                            `${mention.title.toUpperCase()}_INPUT`
                        ),
                        example: PromptString.unsafe_fromUserQuery(
                            `To use ${mention.title} with valid schema: \`<${tagName}>${JSON.stringify({
                                message: mention.data?.properties || 'example input',
                            })}</${tagName}>\``
                        ),
                    },
                }

                // Register the tool
                this.toolFactory.registry.register({
                    name: toolName,
                    ...config,
                    createInstance: toolConfig =>
                        new ModelContextProviderTool(
                            toolConfig as CodyToolConfig,
                            modelContextProvider,
                            mention.title
                        ),
                })

                const tool = this.toolFactory.createTool(toolName)
                if (tool) {
                    this.modelContextProviderTools.push(tool)
                }
                return tool
            })
            .filter(isDefined)
    }

    private async buildOpenCtxCodyTools(): Promise<CodyTool[]> {
        const OPENCTX_CONFIG = {
            'internal-web-provider': {
                title: 'Web (via OpenCtx)',
                tags: {
                    tag: ps`TOOLWEB`,
                    subTag: ps`link`,
                },
                prompt: {
                    instruction: ps`To retrieve content from the link of a webpage`,
                    placeholder: ps`URL`,
                    example: ps`Content from the URL: \`<TOOLWEB><link>https://sourcegraph.com</link></TOOLWEB>\``,
                },
            },
            'internal-linear-issues': {
                title: 'Linear (via OpenCtx)',
                tags: {
                    tag: ps`TOOLLINEAR`,
                    subTag: ps`issue`,
                },
                prompt: {
                    instruction: ps`To retrieve issues in Linear`,
                    placeholder: ps`KEYWORD`,
                    example: ps`Issue about Ollama rate limiting: \`<TOOLLINEAR><issue>ollama rate limit</issue></TOOLLINEAR>\``,
                },
            },
        }

        const providers = await firstValueFrom(getOpenCtxProviders(authStatus, true))
        return providers
            .map(provider => {
                const config = OPENCTX_CONFIG[provider.providerUri as keyof typeof OPENCTX_CONFIG]
                if (config) {
                    this.toolFactory.registry.register({
                        name: provider.providerUri,
                        ...config,
                        createInstance: toolConfig =>
                            new OpenCtxTool(provider, toolConfig as CodyToolConfig),
                    })
                    return this.toolFactory.createTool(provider.providerUri)
                }
                return null
            })
            .filter(isDefined)
    }
}

interface ToolConfiguration extends CodyToolConfig {
    name: string
    createInstance: (config: CodyToolConfig, ...args: any[]) => CodyTool
}

export class ToolRegistry {
    private tools: Map<string, ToolConfiguration> = new Map()

    register(toolConfig: ToolConfiguration): void {
        this.tools.set(toolConfig.name, toolConfig)
    }

    get(name: string): ToolConfiguration | undefined {
        return this.tools.get(name)
    }

    getAllTools(): ToolConfiguration[] {
        return Array.from(this.tools.values())
    }
}

export class ToolFactory {
    public readonly registry = new ToolRegistry()

    createTool(name: string, ...args: any[]): CodyTool | undefined {
        const config = this.registry.get(name)
        if (config) {
            return config.createInstance(config, ...args)
        }
        return undefined
    }
}
