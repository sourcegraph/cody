import { authStatus, firstValueFrom, isDefined, ps } from '@sourcegraph/cody-shared'
import { getOpenCtxProviders } from '../../context/openctx'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import {
    type CodyTool,
    type CodyToolConfig,
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
    onToolStart: (loop: number) => void
    onToolStream: (toolName: string, content: string) => void
    onToolComplete: (toolName: string) => void
    onToolError: (toolName: string, error: Error) => void
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
    private toolFactory = new ToolFactory()
    private shellConfig: CodyShellConfig = {
        user: false,
        instance: false,
        client: false,
    }

    private constructor(private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {
        this.initializeToolRegistry()
        this.initializeOpenCtxTools()
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
        return [...defaultTools, ...this.openCtxTools]
    }

    private async initializeOpenCtxTools(): Promise<void> {
        this.openCtxTools = await this.buildOpenCtxCodyTools()
    }

    private async buildOpenCtxCodyTools(): Promise<CodyTool[]> {
        const OPENCTX_CONFIG = {
            'internal-web-provider': {
                title: 'Web (OpenCtx)',
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
                title: 'Linear (OpenCtx)',
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
