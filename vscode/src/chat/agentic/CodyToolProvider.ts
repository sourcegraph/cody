import {
    type ContextMentionProviderMetadata,
    PromptString,
    type Unsubscribable,
    openCtx,
    openCtxProviderMetadata,
    ps,
} from '@sourcegraph/cody-shared'
import { map } from 'observable-fns'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { type CodyTool, type CodyToolConfig, OpenCtxTool, TOOL_CONFIGS } from './CodyTool'
import { toolboxSettings } from './ToolboxManager'
import { OPENCTX_TOOL_CONFIG } from './config'

export interface ToolStatusCallback {
    onStart(): void
    onStream(tool: string, content: string): void
    onComplete(tool?: string, error?: Error): void
}

export interface ToolConfiguration extends CodyToolConfig {
    name: string
    createInstance: (config: CodyToolConfig, ...args: any[]) => CodyTool
}

export class ToolFactory {
    public readonly registry = new ToolRegistry()
    private toolInstances: Map<string, CodyTool> = new Map()

    public createTool(name: string, ...args: any[]): CodyTool | undefined {
        const config = this.registry.get(name)
        if (!config) {
            return undefined
        }
        if (this.toolInstances.has(name)) {
            return this.toolInstances.get(name)
        }
        const instance = config.createInstance(config, ...args)
        if (instance) {
            this.toolInstances.set(name, instance)
        }
        return instance
    }

    public registerTool(toolConfig: ToolConfiguration): void {
        this.registry.register(toolConfig)
    }

    public getAllTools(): ToolConfiguration[] {
        return this.registry.getAllTools()
    }

    public getAllToolInstances(): CodyTool[] {
        if (!toolboxSettings.getSettings()?.shell ?? false) {
            this.toolInstances.delete('CliTool')
        }
        return Array.from(this.toolInstances.values())
    }

    public buildDefaultCodyTools(
        contextRetriever?: Pick<ContextRetriever, 'retrieveContext'>
    ): CodyTool[] {
        return Object.entries(TOOL_CONFIGS)
            .map(([name]) => this.createTool(name, contextRetriever))
            .filter(Boolean) as CodyTool[]
    }

    public buildOpenCtxCodyTools(providers: ContextMentionProviderMetadata[]): CodyTool[] {
        return providers
            .map(provider => {
                const suffix = provider.id.includes('modelcontextprotocol') ? 'MCP' : ''
                const toolTitle = suffix + provider.title.replace(' ', '').split('/').at(-1)
                // Remove all special characters from the tool name.
                const toolName = 'TOOL' + toolTitle.toUpperCase().replace(/[^a-zA-Z0-9]/g, '')
                const defaultOpenCtxConfig = Object.entries(OPENCTX_TOOL_CONFIG).find(
                    c =>
                        provider.id.toLowerCase().includes(c[0]) ||
                        provider.title.toLowerCase().includes(c[0])
                )
                const genericConfig = {
                    title: provider.title,
                    tags: {
                        tag: PromptString.unsafe_fromUserQuery(toolName),
                        subTag: ps`get`,
                    },
                    prompt: {
                        instruction: PromptString.unsafe_fromUserQuery(provider.queryLabel),
                        placeholder: ps`QUERY`,
                    },
                } as CodyToolConfig

                const config = defaultOpenCtxConfig?.[1] ?? genericConfig
                const name = config.tags.tag.toString()
                this.registerTool({
                    name,
                    ...config,
                    createInstance: toolConfig => new OpenCtxTool(provider, toolConfig),
                })
                return this.createTool(name)
            })
            .filter(Boolean) as CodyTool[]
    }
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
    public static readonly toolFactory = new ToolFactory()

    private static openCtxSubscription: Unsubscribable | undefined

    private constructor(private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {
        this.initializeToolRegistry()
    }

    public static instance(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    ): CodyToolProvider {
        return new CodyToolProvider(contextRetriever)
    }

    private initializeToolRegistry(): void {
        for (const [name, { tool, useContextRetriever }] of Object.entries(TOOL_CONFIGS)) {
            CodyToolProvider.toolFactory.registry.register({
                name,
                ...tool.prototype.config,
                createInstance: useContextRetriever
                    ? (_, contextRetriever) => new tool(contextRetriever)
                    : () => new tool(),
            })
        }
    }

    public static setupOpenCtxProviderListener(): void {
        if (CodyToolProvider.openCtxSubscription || !openCtx.controller) {
            // If the controller is not available yet, we don't subscribe.
            // It will be called again when the controller is set up.
            return
        }

        CodyToolProvider.openCtxSubscription = openCtx.controller
            .metaChanges({}, {})
            .pipe(map(providers => providers.filter(p => !!p.mentions).map(openCtxProviderMetadata)))
            .subscribe(providerMeta => CodyToolProvider.toolFactory.buildOpenCtxCodyTools(providerMeta))
    }

    private initializeToolInstances(): void {
        CodyToolProvider.toolFactory.buildDefaultCodyTools(this.contextRetriever)
    }

    public getTools(): CodyTool[] {
        this.initializeToolInstances()
        return CodyToolProvider.toolFactory.getAllToolInstances()
    }
}
