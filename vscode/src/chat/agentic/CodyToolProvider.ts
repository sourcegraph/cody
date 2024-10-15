import { authStatus, firstValueFrom, isDefined, ps } from '@sourcegraph/cody-shared'
import { getOpenCtxProviders } from '../../context/openctx'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import {
    CliTool,
    type CodyTool,
    type CodyToolConfig,
    FileTool,
    OpenCtxTool,
    SearchTool,
} from './CodyTool'

/**
 * CodyToolProvider is a singleton class responsible for managing and providing access to various Cody tools.
 *
 * This class:
 * - Implements the Singleton pattern to ensure a single instance is used throughout the application.
 * - Initializes and stores different types of Cody tools (e.g., SearchTool, CliTool, FileTool, OpenCtxTool).
 * - Provides methods to retrieve the available tools.
 * - Handles the initialization of OpenCtx tools based on configuration and authentication status.
 *
 * The class uses a ContextRetriever to fetch context for certain tools and
 * lazily initializes the tools when they are first requested.
 */
export class CodyToolProvider {
    private static instance: CodyToolProvider
    private tools: CodyTool[] = []
    private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>

    private constructor(contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {
        this.contextRetriever = contextRetriever
    }

    public static getInstance(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    ): CodyToolProvider {
        if (!CodyToolProvider.instance) {
            CodyToolProvider.instance = new CodyToolProvider(contextRetriever)
        }
        return CodyToolProvider.instance
    }

    public static getTestInstance(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    ): CodyToolProvider {
        return new CodyToolProvider(contextRetriever)
    }

    public async getTools(): Promise<CodyTool[]> {
        if (!this.tools.length) {
            await this.initializeTools()
        }
        return this.tools
    }

    private async initializeTools(): Promise<void> {
        this.tools = [
            new SearchTool(this.contextRetriever),
            new CliTool(),
            new FileTool(),
            ...(await this.buildOpenCtxCodyTools()),
        ]
    }

    private async buildOpenCtxCodyTools(): Promise<CodyTool[]> {
        const OPENCTX_CONFIG = {
            'internal-web-provider': {
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

        return (await firstValueFrom(getOpenCtxProviders(authStatus, true)))
            .map(provider => {
                const config = OPENCTX_CONFIG[provider.providerUri as keyof typeof OPENCTX_CONFIG]
                return config ? new OpenCtxTool(provider, config as CodyToolConfig) : null
            })
            .filter(isDefined)
    }
}
