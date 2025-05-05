import {
    type Unsubscribable,
    logDebug,
    openCtxProviderMetadata,
    openctxController,
    switchMap,
} from '@sourcegraph/cody-shared'
import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { map } from 'observable-fns'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import type { CodyTool } from './CodyTool'
import { ToolFactory } from './CodyToolFactory'
import { toolboxManager } from './ToolboxManager'
import type { CodyToolConfig } from './types'

type Retriever = Pick<ContextRetriever, 'retrieveContext'>

/**
 * Configuration interface for registering new tools.
 * Extends CodyToolConfig with name and instance creation function.
 */
export interface ToolConfiguration extends CodyToolConfig {
    name: string
    createInstance: (config: CodyToolConfig, retriever?: Retriever) => CodyTool
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
