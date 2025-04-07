import {
    CallToolResultSchema,
    ListResourceTemplatesResultSchema,
    ListResourcesResultSchema,
    ListToolsResultSchema,
    ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
    FeatureFlag,
    type MessagePart,
    UIToolStatus,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    logDebug,
    startWith,
} from '@sourcegraph/cody-shared'
import {
    ContextItemSource,
    type ContextItemToolState,
} from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type {
    McpResource,
    McpResourceTemplate,
    McpServer,
    McpTool,
} from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { type Observable, Subject, map } from 'observable-fns'
import * as vscode from 'vscode'
import { z } from 'zod'
import type { AgentTool } from '.'

import { MCPConnectionManager } from './MCPConnectionManager'

// Configuration schemas
const AutoApproveSchema = z.array(z.string()).default([])

const StdioConfigSchema = z.object({
    transportType: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    autoApprove: AutoApproveSchema.optional(),
    disabled: z.boolean().optional(),
})

const SseConfigSchema = z.object({
    transportType: z.literal('sse'),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    withCredentials: z.boolean().optional().default(false),
    autoApprove: AutoApproveSchema.optional(),
    disabled: z.boolean().optional(),
})

const ServerConfigSchema = z.discriminatedUnion('transportType', [StdioConfigSchema, SseConfigSchema])

const McpSettingsSchema = z.object({
    mcpServers: z.record(ServerConfigSchema),
})

/**
 * MCPServerManager handles server-specific operations like tool and resource management
 */
export class MCPServerManager {
    // Event emitter for tool changes
    private toolsEmitter = new vscode.EventEmitter<AgentTool[]>()
    private tools: AgentTool[] = []
    private toolsChangeNotifications = new Subject<void>()

    constructor(private connectionManager: MCPConnectionManager) {}

    /**
     * Tool and resource management
     */
    public async getToolList(serverName: string): Promise<McpTool[]> {
        try {
            const connection = this.connectionManager.getConnection(serverName)
            if (!connection) return []

            const response = await connection.client.request(
                { method: 'tools/list' },
                ListToolsResultSchema
            )

            if (!response?.tools) return []

            // Convert to McpTool format
            const tools =
                response?.tools?.map(tool => ({
                    name: tool.name || '',
                    description: tool.description || '',
                    input_schema: tool.inputSchema || {},
                })) || []

            logDebug('MCPServerManager', `Fetched ${tools.length} tools for ${serverName}`, {
                verbose: { tools },
            })
            await this.registerAgentTools(serverName, tools)
            return tools
        } catch (error) {
            logDebug('MCPServerManager', `Failed to fetch tools for ${serverName}:`, {
                verbose: { error },
            })
            return []
        } finally {
            logDebug('MCPServerManager', `Tool list retrieval process completed for ${serverName}`)
        }
    }

    /**
     * TODO: Add support for resources - currently not supported.
     * Fetches the list of resource from the MCP server.
     */
    public async getResourceList(serverName: string): Promise<McpResource[]> {
        try {
            if (!serverName) return [] // <-- Skip until we support resources

            const connection = this.connectionManager.getConnection(serverName)
            if (!connection) return []

            const response = await connection.client.request(
                { method: 'resources/list' },
                ListResourcesResultSchema
            )
            if (!response?.resources) return []

            const resources = response?.resources?.map(r => ({
                name: r.name,
                uri: r.uri,
                mimeType: r.mimeType,
                title: `${r.title}`,
            }))
            logDebug('MCPServerManager', `Fetched ${resources.length} resources for ${serverName}`, {
                verbose: { resources },
            })
            return resources
        } catch (error) {
            logDebug('MCPServerManager', `Failed to fetch resources for ${serverName}:`, {
                verbose: { error },
            })
            return []
        } finally {
            logDebug('MCPServerManager', `Resource list retrieval process completed for ${serverName}`)
        }
    }

    /**
     * TODO: Add support for prompts templates
     * NOTE: Currently not supported.
     * Fetches the list of resource templates from the MCP server.
     */
    public async getResourceTemplateList(serverName: string): Promise<McpResourceTemplate[]> {
        try {
            if (serverName) return [] // <-- Skip until we support templates

            const connection = this.connectionManager.getConnection(serverName)
            if (!connection) return []

            const response = await connection.client.request(
                { method: 'resources/templates/list' },
                ListResourceTemplatesResultSchema
            )
            if (!response?.resourceTemplates) return []

            return response?.resourceTemplates?.map(t => ({
                type: 'template',
                name: t.name,
                description: t.description,
                mimeType: t.mimeType,
                uri: t.uriTemplate,
            }))
        } catch (error) {
            logDebug('MCPServerManager', `Failed to fetch resource templates for ${serverName}:`, {
                verbose: { error },
            })
            return []
        }
    }

    /**
     * Register agent tools for a server
     */
    public async registerAgentTools(serverName: string, tools: McpTool[]): Promise<void> {
        const _agentTools = []
        for (const tool of tools) {
            try {
                // Create an agent tool
                const agentTool: AgentTool = {
                    spec: {
                        name: `${serverName}_${tool.name || ''}`,
                        description: tool.description || '',
                        input_schema: tool.input_schema || {},
                    },
                    invoke: async (args: Record<string, any>) => {
                        try {
                            return this.executeTool(serverName, tool.name || '', args)
                        } catch (error) {
                            logDebug('MCPServerManager', `Error executing tool ${tool.name || ''}:`, {
                                verbose: { error },
                            })
                        }
                    },
                }

                _agentTools.push(agentTool)

                logDebug('MCPServerManager', `Created agent tool for ${tool.name || ''}`, {
                    verbose: { tool },
                })
            } catch (error) {
                logDebug('MCPServerManager', `Error creating agent tool for ${tool.name || ''}`, {
                    verbose: { error },
                })
            }
        }

        this.updateTools([
            ...this.tools.filter(t => !t.spec.name.startsWith(`${serverName}_`)),
            ..._agentTools,
        ])

        logDebug('MCPServerManager', `Created ${_agentTools.length} agent tools from ${serverName}`, {
            verbose: { _agentTools },
        })
    }

    /**
     * Update the list of available tools
     */
    private updateTools(tools: AgentTool[]): void {
        this.tools = tools
        this.toolsEmitter.fire(this.tools)
        // Trigger change notification to update observable
        this.toolsChangeNotifications.next()
    }

    /**
     * Get all registered tools
     */
    public getTools(): AgentTool[] {
        return this.tools
    }

    /**
     * Subscribe to tool changes
     */
    public onToolsChanged(listener: (tools: AgentTool[]) => void): vscode.Disposable {
        return this.toolsEmitter.event(listener)
    }

    /**
     * Execute a tool from a MCP server
     */
    public async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {}
    ): Promise<any> {
        const connection = this.connectionManager.getConnection(serverName)
        if (!connection) {
            throw new Error(`MCP server "${serverName}" not found`)
        }

        if (connection.server.disabled) {
            throw new Error(`MCP server "${serverName}" is disabled`)
        }

        if (connection.server.status !== 'connected') {
            throw new Error(`MCP server "${serverName}" is not connected`)
        }

        try {
            const result = await connection.client.request(
                {
                    method: 'tools/call',
                    params: { name: toolName, arguments: args },
                },
                CallToolResultSchema
            )

            // Check if response has content field (CallToolResult standard)
            if (!('content' in result)) {
                throw new Error('unexpected response')
            }

            // Process content parts
            const contentParts = result?.content?.map(p => {
                if (p?.type === 'text') {
                    return { type: 'text', text: p.text || 'EMPTY' }
                }
                if (p?.type === 'image') {
                    const mimeType = p.mimeType || 'image/png'
                    const url = `data:${mimeType};base64,${p.data}`
                    return { type: 'image_url', image_url: { url } }
                }
                logDebug('MCPServerManager', `Unsupported content: ${p?.type}`, { verbose: { p } })
                return { type: 'text', text: JSON.stringify(p) }
            }) satisfies MessagePart[]

            logDebug('MCPServerManager', `Tool ${toolName} executed successfully`, {
                verbose: { contentParts },
            })

            return createMCPToolState(serverName, toolName, contentParts)
        } catch (error) {
            logDebug('MCPServerManager', `Error calling tool ${toolName} on server ${serverName}`, {
                verbose: error,
            })
            console.error('MCPServerManager', error)
            throw error
        }
    }

    /**
     * Read a resource from an MCP server
     */
    public async readResource(serverName: string, uri: string): Promise<any> {
        const connection = this.connectionManager.getConnection(serverName)
        if (!connection) {
            throw new Error(`MCP server "${serverName}" not found`)
        }
        if (connection.server.disabled) {
            throw new Error(`MCP server "${serverName}" is disabled`)
        }
        if (connection.server.status !== 'connected') {
            throw new Error(`MCP server "${serverName}" is not connected`)
        }
        try {
            const result = await connection.client.request(
                {
                    method: 'resources/read',
                    params: {
                        uri,
                    },
                },
                ReadResourceResultSchema
            )
            return result.content
        } catch (error) {
            logDebug('MCPServerManager', `Error reading resource ${uri} from server ${serverName}`, {
                verbose: { error },
            })
            throw error
        }
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.toolsEmitter.dispose()
    }
}

/**
 * Main MCP Manager class that coordinates connection and server management
 */
export class MCPManager {
    public static instance: MCPManager | undefined
    private static readonly CONFIG_SECTION = 'cody'
    private static readonly MCP_SERVERS_KEY = 'mcpServers'

    private connectionManager: MCPConnectionManager
    private serverManager: MCPServerManager
    private disposables: vscode.Disposable[] = []

    private static changeNotifications = new Subject<void>()
    private static toolsChangeNotifications = new Subject<void>()
    public static observable: Observable<McpServer[]> = combineLatest(
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.NextAgenticChatInternal),
        this.changeNotifications.pipe(startWith(undefined)),
        this.toolsChangeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([mcpEnabled]) => {
            if (!mcpEnabled) {
                return []
            }
            return MCPManager.instance?.getServers() || []
        }),
        distinctUntilChanged((prev, curr) => {
            // Check if the servers or their tools have changed
            const prevJson = JSON.stringify(prev.map(c => ({ name: c.name, tools: c.tools })))
            const currJson = JSON.stringify(curr.map(c => ({ name: c.name, tools: c.tools })))
            return prevJson === currJson
        })
    )

    constructor() {
        this.connectionManager = new MCPConnectionManager()
        this.serverManager = new MCPServerManager(this.connectionManager)

        // Set up connection status change handler
        this.connectionManager.onStatusChange(event => {
            if (event.status === 'connected') {
                // When a server connects, fetch its tools and resources
                this.initializeServerData(event.serverName).catch(error => {
                    logDebug('MCPManager', `Error initializing server data for ${event.serverName}`, {
                        verbose: { error },
                    })
                })
            }
            // Notify about server changes
            MCPManager.changeNotifications.next()
        })

        // Forward tool changes to static event
        this.serverManager.onToolsChanged(tools => {
            MCPManager.toolsChangeNotifications.next()
        })

        this.init()
    }

    public static async init(): Promise<MCPManager | undefined> {
        if (MCPManager.instance !== undefined) {
            return MCPManager.instance
        }
        return new MCPManager()
    }

    private async init(): Promise<void> {
        try {
            await this.loadServersFromConfig()
            this.observeConfigChanges()
            MCPManager.instance = this
        } catch (error) {
            logDebug('MCPManager', 'Failed to initialize MCP manager', { verbose: { error } })
            MCPManager.instance = undefined
        }
    }

    private observeConfigChanges(): void {
        // Watch for changes to VS Code configuration
        const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
            if (
                event.affectsConfiguration(`${MCPManager.CONFIG_SECTION}.${MCPManager.MCP_SERVERS_KEY}`)
            ) {
                logDebug('MCPManager', 'Reloading settings from configuration...')
                this.loadServersFromConfig().catch(error => {
                    logDebug('MCPManager', 'Error reloading settings from configuration', {
                        verbose: { error },
                    })
                })
            }
        })

        this.disposables.push(configWatcher)
    }

    private async loadServersFromConfig(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = config.get(MCPManager.MCP_SERVERS_KEY, {})

            const result = McpSettingsSchema.safeParse({ mcpServers })

            if (result.success) {
                await this.sync(mcpServers)
                logDebug('MCPManager', 'MCP servers initialized successfully from configuration')
            } else {
                logDebug('MCPManager', 'Invalid MCP settings format in configuration', {
                    verbose: { errors: result.error.format() },
                })
            }
        } catch (error) {
            logDebug('MCPManager', 'Failed to initialize MCP servers from configuration', {
                verbose: { error },
            })
        }
    }

    private async sync(mcpServers: Record<string, any>): Promise<void> {
        logDebug('MCPManager', 'Syncing MCP servers', { verbose: { mcpServers } })
        const currentConnections = this.connectionManager.getAllConnections()
        const currentNames = new Set(currentConnections.map(conn => conn.server.name))
        const newNames = new Set(Object.keys(mcpServers))

        // Delete removed servers
        for (const name of currentNames) {
            if (!newNames.has(name)) {
                await this.connectionManager.removeConnection(name)
                logDebug('MCPManager', `Deleted MCP server: ${name}`)
            }
        }

        // Update or add servers
        for (const [name, config] of Object.entries(mcpServers)) {
            const currentConnection = this.connectionManager.getConnection(name)

            if (!currentConnection) {
                // New server
                try {
                    await this.addConnection(name, config)
                } catch (error) {
                    logDebug('MCPManager', `Failed to connect to MCP server ${name}`, {
                        verbose: { error },
                    })
                }
            } else if (
                JSON.stringify(JSON.parse(currentConnection.server.config)) !== JSON.stringify(config)
            ) {
                // Existing server with changed config
                try {
                    await this.connectionManager.removeConnection(name)
                    await this.addConnection(name, config)
                    logDebug('MCPManager', `Reconnected MCP server with updated config: ${name}`)
                } catch (error) {
                    logDebug('MCPManager', `Failed to reconnect MCP server ${name}`, {
                        verbose: { error },
                    })
                }
            }
        }

        // Notify about server changes
        MCPManager.changeNotifications.next()
    }

    private async addConnection(name: string, config: any): Promise<void> {
        try {
            // Validate config based on transport type
            let isValidConfig = false
            let parsedConfig: any = null

            if (config.transportType === 'stdio') {
                const result = StdioConfigSchema.safeParse(config)
                isValidConfig = result.success
                if (result.success) {
                    parsedConfig = result.data
                }
            } else if (config.transportType === 'sse') {
                const result = SseConfigSchema.safeParse(config)
                isValidConfig = result.success
                if (result.success) {
                    parsedConfig = result.data
                }
            }

            if (!isValidConfig) {
                logDebug('MCPManager', `Invalid config for "${name}": missing or invalid parameters`)
                return
            }

            // Add the connection
            await this.connectionManager.addConnection(name, config, parsedConfig?.disabled)

            // If connection was successful, initialize server data
            const connection = this.connectionManager.getConnection(name)
            if (connection && connection.server.status === 'connected') {
                await this.initializeServerData(name)
            }
        } catch (error) {
            logDebug('MCPManager', `Error adding connection for ${name}`, { verbose: { error } })
            throw error
        }
    }

    /**
     * Initialize server data (tools, resources, etc.) after connection
     */
    private async initializeServerData(serverName: string): Promise<void> {
        const connection = this.connectionManager.getConnection(serverName)
        if (!connection || connection.server.status !== 'connected') return

        try {
            // Fetch tools and resources
            const tools = await this.serverManager.getToolList(serverName)
            const resources = await this.serverManager.getResourceList(serverName)
            const resourceTemplates = await this.serverManager.getResourceTemplateList(serverName)

            // Update server data
            connection.server.tools = tools
            connection.server.resources = resources
            connection.server.resourceTemplates = resourceTemplates

            logDebug('MCPManager', `Initialized data for server: ${serverName}`)
            MCPManager.changeNotifications.next()
        } catch (error) {
            logDebug('MCPManager', `Failed to initialize data for server ${serverName}`, {
                verbose: { error },
            })
        }
    }

    /**
     * Get all available MCP servers
     */
    public getServers(): McpServer[] {
        return this.connectionManager.getAllConnections().map(conn => conn.server)
    }

    /**
     * Get all available tools
     */
    public static get tools(): AgentTool[] {
        return MCPManager.instance?.serverManager.getTools() || []
    }

    /**
     * Subscribe to tool changes
     */
    public static onToolsChanged(listener: (tools: AgentTool[]) => void): vscode.Disposable {
        return (
            MCPManager.instance?.serverManager.onToolsChanged(listener) || {
                dispose: () => {},
            }
        )
    }

    /**
     * Execute a tool from a MCP server
     */
    public async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {}
    ): Promise<any> {
        return this.serverManager.executeTool(serverName, toolName, args)
    }

    /**
     * Read a resource from an MCP server
     */
    public async readResource(serverName: string, uri: string): Promise<any> {
        return this.serverManager.readResource(serverName, uri)
    }

    /**
     * Restart a MCP server connection
     */
    public async restartServer(serverName: string): Promise<void> {
        const connection = this.connectionManager.getConnection(serverName)
        if (!connection) {
            throw new Error(`MCP server "${serverName}" not found`)
        }

        const config = connection.server.config
        if (config) {
            vscode.window.showInformationMessage(`Restarting ${serverName} MCP server...`)

            try {
                await this.connectionManager.removeConnection(serverName)
                // Try to connect again using existing config
                await this.addConnection(serverName, JSON.parse(config))
                vscode.window.showInformationMessage(`${serverName} MCP server connected`)
            } catch (error) {
                logDebug('MCPManager', `Failed to restart connection for ${serverName}`, {
                    verbose: { error },
                })
                vscode.window.showErrorMessage(`Failed to connect to ${serverName} MCP server`)
                throw error
            }
        }
    }

    // Delete an MCP server from configuration
    public async deleteServer(serverName: string): Promise<void> {
        try {
            // Get current configuration
            const config = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = { ...config.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }

            if (mcpServers[serverName]) {
                // Remove server from configuration
                delete mcpServers[serverName]

                // Update configuration
                await config.update(
                    MCPManager.MCP_SERVERS_KEY,
                    mcpServers,
                    vscode.ConfigurationTarget.Global
                )

                // Remove connection
                await this.connectionManager.removeConnection(serverName)

                logDebug('MCPManager', `Deleted MCP server: ${serverName}`)
            } else {
                logDebug('MCPManager', `${serverName} not found in MCP configuration`)
            }
        } catch (error) {
            logDebug('MCPManager', `Failed to delete MCP server: ${serverName}`, { verbose: { error } })
            throw error
        }
    }

    // Add a new MCP server
    public async addServer(name: string, config: any): Promise<void> {
        try {
            // Get current configuration
            const vsConfig = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = { ...vsConfig.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }

            // Check if server already exists
            if (mcpServers[name]) {
                throw new Error(`An MCP server named "${name}" already exists`)
            }

            // Validate config based on transport type
            let isValid = false
            if (config.transportType === 'stdio') {
                isValid = StdioConfigSchema.safeParse(config).success
            } else if (config.transportType === 'sse') {
                isValid = SseConfigSchema.safeParse(config).success
            }

            if (!isValid) {
                throw new Error('Invalid server configuration')
            }

            // Add the new server
            mcpServers[name] = config

            // Update configuration
            await vsConfig.update(
                MCPManager.MCP_SERVERS_KEY,
                mcpServers,
                vscode.ConfigurationTarget.Global
            )

            // Connect to the new server
            await this.addConnection(name, config)
            logDebug('MCPManager', `Added MCP server: ${name}`, { verbose: { config } })
        } catch (error) {
            logDebug('MCPManager', `Failed to add MCP server: ${name}`, { verbose: { error } })
            throw error
        }
    }

    // Update an existing MCP server
    public async updateServer(name: string, config: any): Promise<void> {
        try {
            // Get current configuration
            const vsConfig = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = { ...vsConfig.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }

            // Check if server exists
            if (!mcpServers[name]) {
                throw new Error(`MCP server "${name}" does not exist`)
            }

            // Validate config based on transport type
            let isValid = false
            if (config.transportType === 'stdio') {
                isValid = StdioConfigSchema.safeParse(config).success
            } else if (config.transportType === 'sse') {
                isValid = SseConfigSchema.safeParse(config).success
            }

            if (!isValid) {
                throw new Error('Invalid server configuration')
            }

            // Update the server configuration
            mcpServers[name] = config

            // Update configuration
            await vsConfig.update(
                MCPManager.MCP_SERVERS_KEY,
                mcpServers,
                vscode.ConfigurationTarget.Global
            )

            // Reconnect to the server with new configuration
            await this.connectionManager.removeConnection(name)
            await this.addConnection(name, config)

            logDebug('MCPManager', `Updated MCP server: ${name}`, { verbose: { config } })
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to update MCP server: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    // Clean up resources
    public async dispose(): Promise<void> {
        // Dispose the connection manager
        await this.connectionManager.dispose()

        // Dispose the server manager
        this.serverManager.dispose()

        // Dispose all disposables
        for (const disposable of this.disposables) {
            disposable.dispose()
        }

        this.disposables = []
    }
}

/**
 * Create a tool state object from MCP tool execution result
 */
function createMCPToolState(
    serverName: string,
    toolName: string,
    parts: MessagePart[],
    status = UIToolStatus.Done
): ContextItemToolState {
    const textContent = parts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n')

    const imageContent = parts
        .filter(p => p.type === 'image_url')
        .map(p => p)
        .join('\n')

    return {
        type: 'tool-state',
        toolId: `mcp-${toolName}-${Date.now()}`,
        status,
        toolName: `mcp-${serverName}-${toolName}`,
        content: imageContent || textContent,
        // ContextItemCommon properties
        outputType: 'mcp',
        uri: vscode.Uri.parse(`cody:///tools/mcp/${toolName}`),
        title: serverName + ' - ' + toolName,
        description: textContent,
        source: ContextItemSource.Agentic,
        icon: 'database',
        metadata: ['mcp', toolName],
    }
}
