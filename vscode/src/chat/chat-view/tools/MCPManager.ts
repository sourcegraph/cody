import {
    FeatureFlag,
    combineLatest,
    featureFlagProvider,
    logDebug,
    startWith,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { McpServer } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { type Observable, map } from 'observable-fns'
import * as vscode from 'vscode'
import { z } from 'zod'
import type { AgentTool } from '.'
import { DeepCodyAgent } from '../../agentic/DeepCody'
import { MCPConnectionManager } from './MCPConnectionManager'
import { MCPServerManager } from './MCPServerManager'

/**
 * Base schema with common properties
 */
const AutoApproveSchema = z.array(z.string()).default([])
const BaseConfigSchema = z.object({
    autoApprove: AutoApproveSchema.optional(),
    disabled: z.boolean().optional(),
    error: z.string().optional(),
    disabledTools: z.array(z.string()).optional(),
})

const SseConfigSchema = BaseConfigSchema.extend({
    transportType: z.literal('sse').optional().default('sse'),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    withCredentials: z.boolean().optional().default(false),
})

const StdioConfigSchema = BaseConfigSchema.extend({
    transportType: z.literal('stdio').optional().default('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
})

const ServerConfigSchema = z.union([SseConfigSchema, StdioConfigSchema])

const McpSettingsSchema = z.object({
    mcpServers: z.record(ServerConfigSchema),
})

/**
 * Main MCP Manager class that coordinates connection and server management
 */
export class MCPManager {
    public static instance: MCPManager | undefined
    public static readonly CONFIG_SECTION = 'cody'
    public static readonly MCP_SERVERS_KEY = 'mcpServers'

    private connectionManager = MCPConnectionManager.instance
    public serverManager: MCPServerManager

    private programmaticConfigChangeInProgress = false

    private disposables: vscode.Disposable[] = []

    // Observable for server changes
    public static observable: Observable<McpServer[] | null> = combineLatest(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.AgenticChatWithMCP),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.AgenticContextDisabled),
        MCPConnectionManager.instance.serverChanges.pipe(startWith(undefined))
    ).pipe(
        map(([mcpEnabled, featureDisabled]) => {
            if (!mcpEnabled || featureDisabled || !MCPManager.instance) {
                return null
            }
            return MCPManager.instance.getServers()
        })
    )

    constructor() {
        this.serverManager = new MCPServerManager(this.connectionManager)

        // Set up connection status change handlers
        this.connectionManager.onStatusChange(this.handleConnectionStatusChange.bind(this))
        this.serverManager.onToolsChanged(event => {
            this.connectionManager.notifyToolChanged(event.serverName)
        })

        this.init()
    }

    public static async init(): Promise<MCPManager | undefined> {
        return MCPManager.instance ? MCPManager.instance : new MCPManager()
    }

    private async init(): Promise<void> {
        try {
            MCPManager.instance = this
            await this.loadServersFromConfig()
            this.observeConfigChanges()
            this.setupToolStateListeners()
        } catch (error) {
            logDebug('MCPManager', 'Failed to initialize MCP manager', { verbose: { error } })
            MCPManager.instance = undefined
        }
    }

    private async handleConnectionStatusChange(event: {
        status: string
        serverName: string
        error?: string
    }): Promise<void> {
        logDebug('MCPManager', `Connection status changed for ${event.serverName}: ${event.status}`)

        if (event.status === 'connected') {
            await this.initializeServerData(event.serverName).catch(error => {
                logDebug('MCPManager', `Error initializing server data for ${event.serverName}`, {
                    verbose: { error },
                })
            })
        }
    }

    private setupToolStateListeners(): void {
        this.serverManager.onToolStateChanged(async event => {
            await this.updateToolStateInConfig(event.serverName, event.toolName, event.disabled).catch(
                e => {
                    logDebug('MCPManager', `Failed to update ${event.serverName} config`, { verbose: e })
                }
            )
        })
    }

    public observeConfigChanges(): void {
        const configWatcher = vscode.workspace.onDidChangeConfiguration(async event => {
            if (
                event.affectsConfiguration(`${MCPManager.CONFIG_SECTION}.${MCPManager.MCP_SERVERS_KEY}`)
            ) {
                // Skip processing if this is a programmatic change
                if (this.programmaticConfigChangeInProgress) {
                    logDebug('MCPManager', 'Ignoring programmatic configuration change')
                    return
                }

                // Config was changed externally (e.g., by user editing settings.json)
                logDebug('MCPManager', 'Configuration change detected')

                await this.loadServersFromConfig().catch(e => {
                    logDebug('MCPManager', 'Error reloading servers from config', { verbose: e })
                })
            }
        })

        this.disposables.push(configWatcher)
    }

    /**
     * Load servers from VS Code configuration
     */
    private async loadServersFromConfig(): Promise<void> {
        const mcpServers = getMcpServersConfig()
        if (mcpServers === undefined) {
            return
        }
        const result = McpSettingsSchema.safeParse({ mcpServers })
        if (result.success) {
            await this.sync(mcpServers)
            logDebug('MCPManager', 'MCP servers initialized successfully from configuration')
        } else {
            throw new Error('Invalid MCP server configuration: ' + result.error.format())
        }
    }

    /**
     * Sync servers with configuration
     */
    private async sync(mcpServers: Record<string, any>): Promise<void> {
        logDebug('MCPManager', 'Syncing MCP servers', { verbose: { mcpServers } })

        // Handle removed servers
        const currentConnections = this.connectionManager.getAllConnections()
        const currentNames = new Set(currentConnections.map(conn => conn.server.name))
        const newNames = new Set(Object.keys(mcpServers))

        for (const name of currentNames) {
            if (!newNames.has(name)) {
                await this.connectionManager.removeConnection(name)
                logDebug('MCPManager', `Deleted MCP server: ${name}`)
            }
        }

        // Collect all disabled tools from all servers
        const allDisabledTools: string[] = []

        // Update or add servers and collect their disabled tools
        for (const [name, config] of Object.entries(mcpServers)) {
            const currentConnection = this.connectionManager.getConnection(name)
            try {
                if (currentConnection) {
                    const curConfig = normalizeConfig(JSON.parse(currentConnection.server.config))
                    const userConfig = normalizeConfig(config)
                    if (curConfig === userConfig) {
                        continue // Changed from return to continue to process all servers
                    }
                }
                // Existing server with changed config
                await this.addConnection(name, config)

                // Process disabled tools for this server
                if (config.disabledTools && Array.isArray(config.disabledTools)) {
                    // Always add server prefix to tool names
                    const toolsWithPrefix = config.disabledTools.map(
                        (toolName: string) => `${name}_${toolName}`
                    )
                    allDisabledTools.push(...toolsWithPrefix)
                }
            } catch (error) {
                logDebug('MCPManager', `Failed to reconnect MCP server ${name}`, {
                    verbose: { error },
                })
            }
        }

        // Set all collected disabled tools in the server manager
        this.serverManager.setDisabledTools(allDisabledTools)

        // Explicitly notify about server changes after sync
        this.connectionManager.notifyServerChanged()
    }

    /**
     * Add a new connection
     */
    private async addConnection(name: string, config: any): Promise<void> {
        try {
            const result = validateServerConfig(config)
            if (!result.success) {
                return
            }
            // Add the connection
            const parsedConfig = result.data
            await this.connectionManager.addConnection(name, config, parsedConfig?.disabled)
        } catch (error) {
            logDebug('MCPManager', `Error adding connection for ${name}`, { verbose: { error } })
        }
    }

    /**
     * Initialize server data after connection
     */
    private async initializeServerData(serverName: string): Promise<void> {
        const connection = this.connectionManager.getConnection(serverName)
        if (!connection) return
        try {
            logDebug('MCPManager', `Initializing tools for server: ${serverName}`)
            connection.server.tools = (await this.serverManager.getToolList(serverName)) || []
            logDebug('MCPManager', `Initialized tools for server: ${serverName}`, {
                verbose: { toolCount: connection.server.tools.length },
            })
            // Make sure we notify about the server change
            this.connectionManager.notifyServerChanged(serverName)
        } catch (error) {
            logDebug('MCPManager', `Failed to initialize ${serverName}`, { verbose: error })
        }
    }

    public static get tools(): AgentTool[] {
        return MCPManager.instance?.serverManager.getTools() || []
    }

    /**
     * Get all available servers
     */
    public getServers(): McpServer[] {
        return this.connectionManager.getAllConnections().map(conn => conn.server)
    }

    public async refreshServers(): Promise<void> {
        await this.loadServersFromConfig().catch(error =>
            console.error('Error refreshing servers', error)
        )
        this.connectionManager.notifyServerChanged()
    }

    /**
     * Execute a tool from a MCP server
     */
    public async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {}
    ): Promise<ContextItemToolState> {
        telemetryRecorder.recordEvent('cody.deep-cody.tool', 'executed', {
            privateMetadata: {
                model: DeepCodyAgent.model,
                chatAgent: DeepCodyAgent.id,
                tool_name: toolName,
                server_name: serverName,
                args: JSON.stringify(args),
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })
        return this.serverManager.executeTool(serverName, toolName, args)
    }

    // Enable or disable a tool and save to user configuration
    public async setToolState(serverName: string, toolName: string, disabled: boolean): Promise<void> {
        // Update the tool state in the server manager
        this.serverManager.setToolState(serverName, toolName, disabled)
        telemetryRecorder.recordEvent('cody.deep-cody.tool', disabled ? 'disabled' : 'enabled', {
            privateMetadata: {
                model: DeepCodyAgent.model,
                chatAgent: DeepCodyAgent.id,
                tool_name: toolName,
                server_name: serverName,
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })

        // Update the configuration
        await this.updateToolStateInConfig(serverName, toolName, disabled)
    }

    /**
     * Update tool state in the user configuration
     */
    private async updateToolStateInConfig(
        serverName: string,
        toolName: string,
        disabled: boolean
    ): Promise<void> {
        try {
            // Get current configuration
            const mcpServers = getMcpServersConfig()

            // Verify server exists
            const serverConfig = mcpServers[serverName]
            if (!serverConfig) {
                throw new Error(`MCP server "${serverName}" does not exist in configuration`)
            }

            // Get existing disabled tools or create new array
            const disabledTools = Array.isArray(serverConfig.disabledTools)
                ? [...serverConfig.disabledTools]
                : []

            // Update disabled tools list (add or remove as needed)
            const toolIndex = disabledTools.indexOf(toolName)
            if (disabled && toolIndex === -1) {
                disabledTools.push(toolName)
            } else if (!disabled && toolIndex !== -1) {
                disabledTools.splice(toolIndex, 1)
            } else {
                // No change needed, exit early
                return
            }

            // Update configuration with modified server config
            await this.updateMcpServerConfig({
                ...mcpServers,
                [serverName]: {
                    ...serverConfig,
                    disabledTools,
                },
            })
        } catch (error) {
            logDebug('MCPManager', `Failed to update tool state in config: ${error}`, {
                verbose: { error },
            })
            throw error
        }
    }

    /**
     * Manages server operations with common error handling and telemetry
     */
    private async manageServerOperation(
        operation: 'add' | 'update' | 'delete',
        name: string,
        config?: any
    ): Promise<void> {
        try {
            // Get current configuration
            const mcpServers = getMcpServersConfig()

            // Perform the requested operation
            if (operation === 'add') {
                if (mcpServers[name]) {
                    throw new Error(`An MCP server named "${name}" already exists`)
                }

                const result = validateServerConfig(config)
                if (!result.success) {
                    throw new Error('Invalid server configuration')
                }

                // Add the new server
                mcpServers[config?.name ?? name] = config
            } else if (operation === 'update') {
                if (!mcpServers[name] || !mcpServers[config?.name]) {
                    logDebug('', `MCP server "${name}" does not exist`)
                }

                // Merge existing config with new config
                const mergedConfig = {
                    ...mcpServers[name],
                    ...config,
                }

                // Set default transport type if not provided
                const configWithDefaults = {
                    transportType: 'stdio',
                    ...mergedConfig,
                }

                const result = validateServerConfig(configWithDefaults)

                if (!result.success) {
                    throw new Error('Invalid server configuration')
                }

                // Update server with merged config
                mcpServers[config?.name ?? name] = mergedConfig
            } else if (operation === 'delete') {
                if (mcpServers[name]) {
                    // Remove server from configuration
                    delete mcpServers[name]
                } else {
                    logDebug('MCPManager', `${name} not found in MCP configuration`)
                }
            }

            // Use the centralized method to update configuration
            await this.updateMcpServerConfig(mcpServers)

            // Handle connections
            if (operation === 'delete') {
                await this.connectionManager.removeConnection(name)
                logDebug('MCPManager', `Deleted MCP server: ${name}`)
            } else if (operation === 'update') {
                // Reconnect with new configuration
                await this.connectionManager.removeConnection(name)
                await this.addConnection(name, mcpServers[name]) // Use the merged config here
                logDebug('MCPManager', `Updated ${name}`, {
                    verbose: { config: mcpServers[name] },
                })
            } else if (operation === 'add') {
                // Connect to new server
                await this.addConnection(name, config)
                logDebug('MCPManager', `Added MCP server: ${name}`, { verbose: { config } })

                // Initialize tools if connected
                const connection = this.connectionManager.getConnection(name)
                if (connection?.server.status === 'connected') {
                    await this.initializeServerData(name)
                }
            }
        } catch (error) {
            logDebug('MCPManager', `Failed to ${operation} MCP server: ${name}`, { verbose: { error } })

            if (operation === 'update') {
                vscode.window.showErrorMessage(
                    `Failed to update MCP server: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
            } else {
                throw error
            }
        } finally {
            // Record telemetry
            const telemetryAction =
                operation === 'add' ? 'added' : operation === 'update' ? 'updated' : 'removed'

            telemetryRecorder.recordEvent('cody.deep-cody.server', telemetryAction, {
                privateMetadata: {
                    model: DeepCodyAgent.model,
                    chatAgent: DeepCodyAgent.id,
                    server_name: name,
                },
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        }
    }

    private async setServerState(name: string, enabled: boolean): Promise<void> {
        try {
            // Get current configuration
            const mcpServers = getMcpServersConfig()

            // Check if server exists
            if (!mcpServers[name]) {
                throw new Error(`MCP server "${name}" does not exist`)
            }

            // Update the disabled flag (disabled is the opposite of enabled)
            mcpServers[name] = {
                ...mcpServers[name],
                disabled: !enabled,
            }

            // Use the centralized method to update configuration
            await this.updateMcpServerConfig(mcpServers)

            // Handle connection based on state
            if (enabled) {
                // Try to connect to the server when enabling
                try {
                    await this.addConnection(name, mcpServers[name])
                    logDebug('MCPManager', `Enabled and connected to MCP server: ${name}`)
                } catch (error) {
                    logDebug('MCPManager', `Enabled MCP server but failed to connect: ${name}`, {
                        verbose: { error },
                    })
                }
            } else {
                // Disconnect when disabling
                await this.connectionManager.removeConnection(name)
                logDebug('MCPManager', `Disabled MCP server: ${name}`)
            }
        } catch (error) {
            const action = enabled ? 'enable' : 'disable'
            vscode.window.showErrorMessage(
                `Failed to ${action} MCP server: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            throw error
        } finally {
            // Record appropriate telemetry event
            const eventType = enabled ? 'enabled' : 'disabled'
            telemetryRecorder.recordEvent('cody.deep-cody.server', eventType, {
                privateMetadata: {
                    model: DeepCodyAgent.model,
                    chatAgent: DeepCodyAgent.id,
                    server_name: name,
                },
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        }
    }

    public async addServer(name: string, config: any): Promise<void> {
        return this.manageServerOperation('add', name, config)
    }
    public async updateServer(name: string, config: any): Promise<void> {
        return this.manageServerOperation('update', name, config)
    }
    public async deleteServer(name: string): Promise<void> {
        return this.manageServerOperation('delete', name)
    }
    public async disableServer(name: string): Promise<void> {
        return this.setServerState(name, false)
    }
    public async enableServer(name: string): Promise<void> {
        return this.setServerState(name, true)
    }

    /**
     * Updates the MCP servers configuration in user settings
     * Always removes transportType and error fields before saving
     */
    private async updateMcpServerConfig(updatedServers: Record<string, any>): Promise<void> {
        try {
            // Set flag before making the update to prevent firing the config change event.
            this.programmaticConfigChangeInProgress = true

            // Clean up servers configuration before writing to user settings
            const cleanedServers = Object.entries(updatedServers).reduce(
                (acc, [serverName, serverConfig]) => {
                    // Create a shallow copy and remove fields that shouldn't be persisted
                    const cleanConfig = { ...serverConfig }
                    cleanConfig.transportType = undefined
                    cleanConfig.error = undefined

                    acc[serverName] = cleanConfig
                    return acc
                },
                {} as Record<string, any>
            )
            // Get configuration and update it
            const config = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            await config.update(
                MCPManager.MCP_SERVERS_KEY,
                cleanedServers,
                vscode.ConfigurationTarget.Global
            )

            logDebug('MCPManager', 'Updated MCP servers configuration', {
                verbose: { serverCount: Object.keys(cleanedServers).length },
            })
        } finally {
            this.programmaticConfigChangeInProgress = false
        }
    }

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
        // Clear the static instance
        MCPManager.instance = undefined
        logDebug('MCPManager', 'disposed')
    }

    public static dispose(): void {
        MCPManager.instance?.dispose().catch(error => {
            logDebug('MCPManager', 'Error disposing MCPManager', { verbose: { error } })
        })
    }
}

function normalizeConfig(config: any): string {
    return JSON.stringify({
        ...config,
        transportType: undefined,
        error: undefined,
    })
}

function validateServerConfig(config: any): { success: boolean; data?: any; error?: Error } {
    const isSSE = config.transportType === 'sse' || 'url' in config
    const configWithDefaults = {
        ...config,
        transportType: isSSE ? 'sse' : 'stdio',
    }

    const result = isSSE
        ? SseConfigSchema.safeParse(configWithDefaults)
        : StdioConfigSchema.safeParse(configWithDefaults)

    if (!result.success) {
        return {
            success: false,
            error: new Error('Invalid server configuration: ' + JSON.stringify(result.error.format())),
        }
    }

    return { success: true, data: result.data }
}

function getMcpServersConfig(): Record<string, any> {
    const vsConfig = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
    return { ...vsConfig.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }
}
