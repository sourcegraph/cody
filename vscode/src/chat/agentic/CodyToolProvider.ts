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
    private tools: Map<string, ToolConfiguration> = new Map()

    constructor(private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {}

    public register(toolConfig: ToolConfiguration): void {
        this.tools.set(toolConfig.name, toolConfig)
    }

    public createTool(name: string, ...args: any[]): CodyTool | undefined {
        const config = this.tools.get(name)
        if (!config) {
            return undefined
        }
        const instance = config.createInstance(config, ...args)
        return instance
    }

    public getInstances(): CodyTool[] {
        // Create fresh instances of all registered tools
        return Array.from(this.tools.entries())
            .filter(([name]) => name !== 'CliTool' || toolboxSettings.getSettings()?.shell)
            .map(([_, config]) => config.createInstance(config, this.contextRetriever))
            .filter(Boolean) as CodyTool[]
    }

    public createDefaultTools(contextRetriever?: Pick<ContextRetriever, 'retrieveContext'>): CodyTool[] {
        return Object.entries(TOOL_CONFIGS)
            .map(([name]) => this.createTool(name, contextRetriever))
            .filter(Boolean) as CodyTool[]
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
            .filter(Boolean) as CodyTool[]
    }

    private generateToolName(provider: ContextMentionProviderMetadata): string {
        const suffix = provider.id.includes('modelcontextprotocol') ? 'MCP' : ''
        const title = provider.title.replace(' ', '').split('/').at(-1)
        return 'TOOL' + title?.toUpperCase().replace(/[^a-zA-Z0-9]/g, '') + suffix
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
 * CodyToolProvider is a singleton class responsible for managing and providing access to various Cody tools.
 * It handles both default tools and OpenContext-based tools (like web and Linear integrations).
 *
 * Key responsibilities:
 * - Maintains a registry of available tools through ToolFactory
 * - Initializes and manages default Cody tools
 * - Manages OpenContext tools for external integrations
 * - Provides a unified interface to access all available tools
 */
export namespace CodyToolProvider {
    export let factory: ToolFactory
    let openCtxSubscription: Unsubscribable

    export function initialize(contextRetriever: Pick<ContextRetriever, 'retrieveContext'>): void {
        factory = new ToolFactory(contextRetriever)
        initializeRegistry()
    }

    export function getTools(): CodyTool[] {
        const instances = factory.getInstances()
        return instances
    }

    export function setupOpenCtxProviderListener(): void {
        if (!openCtx.controller) {
            console.error('OpenCtx controller not available')
        }
        if (openCtxSubscription || !openCtx.controller) {
            return
        }

        openCtxSubscription = openCtx.controller
            .metaChanges({}, {})
            .pipe(map(providers => providers.filter(p => !!p.mentions).map(openCtxProviderMetadata)))
            .subscribe(providerMeta => factory.createOpenCtxTools(providerMeta))
    }

    function initializeRegistry(): void {
        for (const [name, { tool, useContextRetriever }] of Object.entries(TOOL_CONFIGS)) {
            factory.register({
                name,
                ...tool.prototype.config,
                createInstance: useContextRetriever
                    ? (_, contextRetriever) => new tool(contextRetriever)
                    : () => new tool(),
            })
        }
    }
}
