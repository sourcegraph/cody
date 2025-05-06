import {
    FeatureFlag,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    logDebug,
    startWith,
} from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { McpServer } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { type Observable, Subject, map } from 'observable-fns'
import * as vscode from 'vscode'
import { z } from 'zod'
import type { AgentTool } from '.'
import { MCPConnectionManager } from './MCPConnectionManager'
import { MCPServerManager } from './MCPServerManager'
import { registerMCPCommands } from './mcp'

/**
 * Debounce function with improved promise handling
 */
function debounce<T extends (...args: any[]) => Promise<void>>(
    func: T,
    wait: number
): (...args: Parameters<T>) => Promise<void> {
    let timeout: NodeJS.Timeout | null = null
    let pendingPromise: Promise<void> | null = null

    return async (...args: Parameters<T>): Promise<void> => {
        if (timeout) {
            clearTimeout(timeout)
        }

        if (pendingPromise) {
            return pendingPromise
        }

        pendingPromise = new Promise<void>((resolve, reject) => {
            timeout = setTimeout(() => {
                timeout = null
                func(...args)
                    .then(() => {
                        pendingPromise = null
                        resolve()
                    })
                    .catch(err => {
                        pendingPromise = null
                        reject(err)
                    })
            }, wait)
        })

        return pendingPromise
    }
}

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
    // Static properties
    public static instance: MCPManager | undefined
    private static readonly CONFIG_SECTION = 'cody'
    private static readonly MCP_SERVERS_KEY = 'mcpServers'
    private static readonly DEBOUNCE_TIMEOUT = 1000 // 1 second debounce timeout

    private connectionManager: MCPConnectionManager
    public serverManager: MCPServerManager
    private disposables: vscode.Disposable[] = []
    private debouncedSync: (mcpServers: Record<string, any>) => Promise<void>
    private static isUpdatingConfig = false
    private static updatingServerName: string | null = null
    private static changeNotifications = new Subject<{ type: 'server' | 'all'; serverName?: string }>()
    private static toolsChangeNotifications = new Subject<{
        type: 'tool' | 'all'
        serverName?: string
        toolName?: string
    }>()

    // Observable for server changes
    public static observable: Observable<McpServer[]> = combineLatest(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.NextAgenticChatInternal),
        this.changeNotifications.pipe(startWith({ type: 'all' })),
        this.toolsChangeNotifications.pipe(startWith({ type: 'all' }))
    ).pipe(
        map(([mcpEnabled, serverChange, toolChange]) => {
            if (!mcpEnabled || !MCPManager.instance) {
                return []
            }
            if (
                serverChange?.type === 'server' &&
                'serverName' in serverChange &&
                serverChange.serverName
            ) {
                return MCPManager.instance.getServers()
            }
            return MCPManager.instance.getServers()
        }),
        distinctUntilChanged((prev, curr) => {
            if (prev.length === 0 && curr.length === 0) {
                return true
            }
            const prevJson = JSON.stringify(prev.map(c => ({ name: c.name, tools: c.tools })))
            const currJson = JSON.stringify(curr.map(c => ({ name: c.name, tools: c.tools })))
            return prevJson === currJson
        })
    )

    constructor() {
        registerMCPCommands(this.disposables)
        this.connectionManager = new MCPConnectionManager()
        this.serverManager = new MCPServerManager(this.connectionManager)
        // Create debounced version of sync method
        this.debouncedSync = debounce(this.sync.bind(this), MCPManager.DEBOUNCE_TIMEOUT)

        // Set up connection status change handler
        this.connectionManager.onStatusChange(this.handleConnectionStatusChange.bind(this))

        // Forward tool changes
        this.serverManager.onToolsChanged(event => {
            const serverName = event.serverName || ''
            MCPManager.toolsChangeNotifications.next({
                type: 'tool',
                serverName,
                toolName: event.toolName,
            })
        })

        this.init()
    }

    /**
     * Handle connection status changes
     */
    private handleConnectionStatusChange(event: {
        status: string
        serverName: string
        error?: string
    }): void {
        if (event.status === 'connected') {
            this.initializeServerData(event.serverName).catch(error => {
                logDebug('MCPManager', `Error initializing server data for ${event.serverName}`, {
                    verbose: { error },
                })
            })
        }

        const conn = this.connectionManager.getConnection(event.serverName)
        if (conn && event.error && conn.server.error) {
            conn.server.error = event.error
        }

        MCPManager.changeNotifications.next({ type: 'server', serverName: event.serverName })
    }

    /**
     * Static initialization
     */
    public static async init(): Promise<MCPManager | undefined> {
        if (MCPManager.instance) {
            return MCPManager.instance
        }
        return new MCPManager()
    }

    /**
     * Instance initialization
     */
    private async init(): Promise<void> {
        try {
            await this.loadServersFromConfig()
            this.observeConfigChanges()
            this.setupToolStateListeners()
            MCPManager.instance = this
        } catch (error) {
            logDebug('MCPManager', 'Failed to initialize MCP manager', { verbose: { error } })
            MCPManager.instance = undefined
        }
    }

    /**
     * Set up tool state change listeners
     */
    private setupToolStateListeners(): void {
        this.serverManager.onToolStateChanged(event => {
            this.updateToolStateInConfig(event.serverName, event.toolName, event.disabled).catch(
                error => {
                    logDebug('MCPManager', `Failed to update tool state in config: ${error}`, {
                        verbose: { error },
                    })
                }
            )
        })
    }

    /**
     * Observe configuration changes
     */
    public observeConfigChanges(): void {
        const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
            if (
                event.affectsConfiguration(`${MCPManager.CONFIG_SECTION}.${MCPManager.MCP_SERVERS_KEY}`)
            ) {
                if (MCPManager.isUpdatingConfig) {
                    // Config was changed through our API calls
                    logDebug(
                        'MCPManager',
                        `Configuration change detected while updating config via API. Server: ${
                            MCPManager.updatingServerName || 'unknown'
                        }`
                    )

                    // If we know which server was updated, only refresh that one
                    if (MCPManager.updatingServerName) {
                        const config = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
                        const mcpServers = config.get<Record<string, any>>(
                            MCPManager.MCP_SERVERS_KEY,
                            {}
                        )

                        // If server was added, initialize it
                        if (mcpServers[MCPManager.updatingServerName]) {
                            // For adds, the connect part is already handled in addServer
                            logDebug(
                                'MCPManager',
                                `Selective refresh for server: ${MCPManager.updatingServerName}`
                            )
                        } else {
                            // For deletes, the connection removal is already handled in deleteServer
                            logDebug(
                                'MCPManager',
                                `Server was deleted: ${MCPManager.updatingServerName}`
                            )
                        }
                    }
                    // No need to do a full reload as the individual operations handle their own connections
                } else {
                    // Config was changed externally (e.g., by user editing settings.json)
                    logDebug(
                        'MCPManager',
                        'External configuration change detected, reloading all servers...'
                    )
                    this.loadServersFromConfig().catch(error => {
                        logDebug('MCPManager', 'Error reloading settings from configuration', {
                            verbose: { error },
                        })
                    })
                }
            }
        })

        this.disposables.push(configWatcher)
    }

    /**
     * Load servers from VS Code configuration
     */
    private async loadServersFromConfig(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = config.get(MCPManager.MCP_SERVERS_KEY, {})
            const result = McpSettingsSchema.safeParse({ mcpServers })

            if (result.success) {
                await this.debouncedSync(mcpServers)
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
                // Notify about server changes
                MCPManager.changeNotifications.next({ type: 'server', serverName: name })
            } else if (
                JSON.stringify(JSON.parse(currentConnection.server.config)) !== JSON.stringify(config)
            ) {
                // Existing server with changed config
                try {
                    await this.connectionManager.removeConnection(name)
                    await this.addConnection(name, config)
                    logDebug('MCPManager', `Reconnected MCP server with updated config: ${name}`)
                    // Notify about server changes
                    MCPManager.changeNotifications.next({ type: 'server', serverName: name })
                } catch (error) {
                    logDebug('MCPManager', `Failed to reconnect MCP server ${name}`, {
                        verbose: { error },
                    })
                }
            }
        }
        // Load disabled tools from configuration
        this.loadDisabledToolsFromConfig(mcpServers)
        // Notify about server changes
        MCPManager.changeNotifications.next({ type: 'all' })
    }

    /**
     * Add a new connection
     */
    private async addConnection(name: string, config: any): Promise<void> {
        try {
            // Determine transport type and set defaults
            const isSSE = 'url' in config
            const configWithDefaults = {
                ...config,
                transportType: isSSE ? 'sse' : 'stdio',
            }
            // Validate the config
            const result = ServerConfigSchema.safeParse(configWithDefaults)
            if (!result.success) {
                logDebug('MCPManager', `Invalid config for "${name}": missing or invalid parameters`, {
                    verbose: { errors: result.error.format() },
                })
                return
            }
            // Add the connection
            const parsedConfig = result.data
            await this.connectionManager.addConnection(name, configWithDefaults, parsedConfig?.disabled)

            MCPManager.changeNotifications.next({ type: 'server', serverName: name })

            // Initialize server data if connected
            const connection = this.connectionManager.getConnection(name)
            if (connection?.server.status === 'connected') {
                await this.initializeServerData(name)
            }
        } catch (error) {
            logDebug('MCPManager', `Error adding connection for ${name}`, { verbose: { error } })
            throw error
        }
    }

    /**
     * Initialize server data after connection
     */
    private async initializeServerData(serverName: string): Promise<void> {
        const connection = this.connectionManager.getConnection(serverName)
        if (!connection || connection.server.status !== 'connected') return
        // Fetch tools
        try {
            const tools = await this.serverManager.getToolList(serverName)
            connection.server.tools = tools
            logDebug('MCPManager', `Initialized tools for server: ${serverName}`)
        } catch (error) {
            logDebug('MCPManager', `Failed to initialize tools for server ${serverName}`, {
                verbose: { error },
            })
        }

        this.loadDisabledToolsForServer(serverName)

        MCPManager.toolsChangeNotifications.next({ type: 'tool', serverName })
        MCPManager.changeNotifications.next({ type: 'server', serverName })

        // Fetch resources
        try {
            const resources = await this.serverManager.getResourceList(serverName)
            connection.server.resources = resources
            logDebug('MCPManager', `Initialized resources for server: ${serverName}`)
        } catch (error) {
            logDebug('MCPManager', `Failed to initialize resources for server ${serverName}`, {
                verbose: { error },
            })
        }

        // Fetch resource templates
        try {
            const resourceTemplates = await this.serverManager.getResourceTemplateList(serverName)
            connection.server.resourceTemplates = resourceTemplates
            logDebug('MCPManager', `Initialized resource templates for server: ${serverName}`)
        } catch (error) {
            logDebug('MCPManager', `Failed to initialize resource templates for server ${serverName}`, {
                verbose: { error },
            })
        }

        // Final notifications
        MCPManager.toolsChangeNotifications.next({ type: 'tool', serverName })
        MCPManager.changeNotifications.next({ type: 'server', serverName })
    }

    /**
     * Get all available servers
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
    public static onToolsChanged(
        listener: (event: { serverName: string; toolName?: string; tools: AgentTool[] }) => void
    ): vscode.Disposable {
        return MCPManager.instance?.serverManager.onToolsChanged(listener) || { dispose: () => {} }
    }

    /**
     * Load disabled tools from configuration
     */
    private loadDisabledToolsFromConfig(mcpServers: Record<string, any>): void {
        const allDisabledTools: string[] = []

        // Collect all disabled tools from all servers
        for (const [serverName, config] of Object.entries(mcpServers)) {
            if (config.disabledTools && Array.isArray(config.disabledTools)) {
                // Always add server prefix to tool names
                const toolsWithPrefix = config.disabledTools.map(
                    (toolName: string) => `${serverName}_${toolName}`
                )

                allDisabledTools.push(...toolsWithPrefix)
            }
        }

        // Set the disabled tools in the server manager
        if (allDisabledTools.length > 0) {
            this.serverManager.setDisabledTools(allDisabledTools)
            logDebug(
                'MCPManager',
                `Loaded ${allDisabledTools.length} disabled tools from configuration`,
                {
                    verbose: { disabledTools: allDisabledTools },
                }
            )
        }
    }

    /**
     * Load disabled tools for a specific server
     */
    private loadDisabledToolsForServer(serverName: string): void {
        const conn = this.connectionManager.getConnection(serverName)
        if (!conn?.server.config) return

        try {
            const config = JSON.parse(conn.server.config)
            if (config.disabledTools && Array.isArray(config.disabledTools)) {
                // Always add server prefix to tool names
                const toolsWithPrefix = config.disabledTools.map(
                    (toolName: string) => `${serverName}_${toolName}`
                )

                if (toolsWithPrefix.length > 0) {
                    // Use append=true to add to the existing set rather than replacing it
                    this.serverManager.setDisabledTools(toolsWithPrefix, true)
                    logDebug('MCPManager', `Loaded disabled tools for server: ${serverName}`, {
                        verbose: { disabledTools: toolsWithPrefix },
                    })
                }
            }
        } catch (error) {
            logDebug('MCPManager', `Error loading disabled tools from config: ${error}`, {
                verbose: { error },
            })
        }
    }

    /**
     * Refresh all MCP servers
     */
    public async refreshServers(): Promise<void> {
        try {
            logDebug('MCPManager', 'Manually refreshing MCP servers')
            // Get current configuration directly instead of using the debounced method
            const config = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = config.get(MCPManager.MCP_SERVERS_KEY, {})
            // Call sync directly instead of using the debounced version to ensure immediate execution
            await this.sync(mcpServers)
            // Only notify after sync has fully completed
            MCPManager.changeNotifications.next({ type: 'all' })
        } catch (error) {
            logDebug('MCPManager', 'Failed to refresh MCP servers', { verbose: { error } })
            vscode.window.showErrorMessage(
                `Failed to refresh MCP servers: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            throw error
        }
    }

    /**
     * Execute a tool from a MCP server
     */
    public async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {}
    ): Promise<ContextItemToolState> {
        return this.serverManager.executeTool(serverName, toolName, args)
    }

    // Enable or disable a tool and save to user configuration
    public async setToolState(serverName: string, toolName: string, disabled: boolean): Promise<void> {
        // Update the tool state in the server manager
        this.serverManager.setToolState(serverName, toolName, disabled)

        // Update the configuration
        await this.updateToolStateInConfig(serverName, toolName, disabled)

        // Notify through the toolsChangeNotifications subject
        MCPManager.toolsChangeNotifications.next({ type: 'tool', serverName, toolName })
    }

    // Update tool state in the user configuration
    private async updateToolStateInConfig(
        serverName: string,
        toolName: string,
        disabled: boolean
    ): Promise<void> {
        try {
            // Set the flag to prevent config change events from triggering a reload
            MCPManager.isUpdatingConfig = true

            // Get current configuration
            const config = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = { ...config.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }

            // Check if server exists
            if (!mcpServers[serverName]) {
                throw new Error(`MCP server "${serverName}" does not exist in configuration`)
            }

            // Get server config
            const serverConfig = mcpServers[serverName]

            // Get or initialize disabledTools array
            const disabledTools = Array.isArray(serverConfig.disabledTools)
                ? [...serverConfig.disabledTools]
                : []

            // Update the disabled tools list
            if (disabled) {
                // Add to disabled list if not already there
                if (!disabledTools.includes(toolName)) {
                    disabledTools.push(toolName) // Store without server prefix
                }
            } else {
                // Remove from disabled list if there
                const index = disabledTools.indexOf(toolName)
                if (index !== -1) disabledTools.splice(index, 1)
            }

            // Update the server config
            mcpServers[serverName] = {
                ...serverConfig,
                disabledTools,
            }

            // Save to VS Code configuration
            await config.update(
                MCPManager.MCP_SERVERS_KEY,
                mcpServers,
                vscode.ConfigurationTarget.Global
            )

            logDebug(
                'MCPManager',
                `Updated tool state in config: ${serverName}_${toolName} disabled=${disabled}`,
                {
                    verbose: { disabledTools },
                }
            )
        } catch (error) {
            logDebug('MCPManager', `Failed to update tool state in config: ${error}`, {
                verbose: { error },
            })
            throw error
        } finally {
            // Reset the flag after the update is complete
            MCPManager.isUpdatingConfig = false
        }
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
            try {
                await this.connectionManager.removeConnection(serverName)
                const parsedConfig = JSON.parse(config)
                const isSSE = parsedConfig.url !== undefined
                parsedConfig.transportType = isSSE ? 'sse' : 'stdio'

                // Try to connect again using existing config
                await this.addConnection(serverName, parsedConfig)
            } catch (error) {
                logDebug('MCPManager', `Failed to restart connection for ${serverName}`, {
                    verbose: { error },
                })
                vscode.window.showErrorMessage(`Failed to connect to ${serverName} MCP server`)
                throw error
            }
        }
    }

    /**
     * Delete an MCP server from configuration
     */
    public async deleteServer(serverName: string): Promise<void> {
        try {
            // Set flags to track that we're updating a specific server
            MCPManager.isUpdatingConfig = true
            MCPManager.updatingServerName = serverName

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

                // Explicitly notify about server  removal to update UI
                MCPManager.changeNotifications.next({ type: 'server', serverName })
            } else {
                logDebug('MCPManager', `${serverName} not found in MCP configuration`)
            }
        } catch (error) {
            logDebug('MCPManager', `Failed to delete MCP server: ${serverName}`, { verbose: { error } })
            throw error
        } finally {
            // Reset flags after operation is complete
            MCPManager.isUpdatingConfig = false
            MCPManager.updatingServerName = null
        }
    }

    public async addServer(name: string, config: any): Promise<void> {
        try {
            // Set flags to track that we're updating a specific server
            MCPManager.isUpdatingConfig = true
            MCPManager.updatingServerName = name

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

            // Connect only the new server
            await this.addConnection(name, config)
            logDebug('MCPManager', `Added MCP server: ${name}`, { verbose: { config } })

            // Ensure tools and other server data are fully initialized before notifying UI
            const connection = this.connectionManager.getConnection(name)
            if (connection?.server.status === 'connected') {
                // Wait for tool initialization to complete
                await this.initializeServerData(name)
                // Now send notifications after all data is initialized
                MCPManager.changeNotifications.next({ type: 'server', serverName: name })
            }
        } catch (error) {
            logDebug('MCPManager', `Failed to add MCP server: ${name}`, { verbose: { error } })
            throw error
        } finally {
            // Reset flags after operation is complete
            MCPManager.isUpdatingConfig = false
            MCPManager.updatingServerName = null
        }
    }

    public async updateServer(name: string, config: any): Promise<void> {
        try {
            // Get current configuration
            const vsConfig = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = { ...vsConfig.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }

            // Check if server exists
            if (!mcpServers[name]) {
                throw new Error(`MCP server "${name}" does not exist`)
            }

            // Set default transport type if not provided
            const configWithDefaults = {
                transportType: 'stdio',
                ...config,
            }

            // Validate config based on transport type
            const isSSE = configWithDefaults.transportType === 'sse'
            const result = isSSE
                ? SseConfigSchema.safeParse(configWithDefaults)
                : StdioConfigSchema.safeParse(configWithDefaults)

            if (!result.success) {
                throw new Error('Invalid server configuration')
            }

            // Update the server configuration (don't store error in config)
            mcpServers[name] = { ...config, error: null }

            // Update configuration
            await vsConfig.update(
                MCPManager.MCP_SERVERS_KEY,
                mcpServers,
                vscode.ConfigurationTarget.Global
            )

            // Only disconnect and reconnect the updated server
            await this.connectionManager.removeConnection(name)
            await this.addConnection(name, configWithDefaults)

            logDebug('MCPManager', `Updated MCP server: ${name}`, {
                verbose: { config: configWithDefaults },
            })

            // Notify about server changes with specific server name
            MCPManager.changeNotifications.next({ type: 'server', serverName: name })
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to update MCP server: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    public async disableServer(name: string): Promise<void> {
        try {
            // Get current configuration
            const vsConfig = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = { ...vsConfig.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }

            // Check if server exists
            if (!mcpServers[name]) {
                throw new Error(`MCP server "${name}" does not exist`)
            }

            // Update the disabled flag
            mcpServers[name] = {
                ...mcpServers[name],
                disabled: true,
            }

            // Update configuration
            await vsConfig.update(
                MCPManager.MCP_SERVERS_KEY,
                mcpServers,
                vscode.ConfigurationTarget.Global
            )

            // If the server is connected, disconnect it
            await this.connectionManager.removeConnection(name)

            logDebug('MCPManager', `Disabled MCP server: ${name}`)

            // Notify about server changes with specific server name
            MCPManager.changeNotifications.next({ type: 'server', serverName: name })
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to disable MCP server: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    public async enableServer(name: string): Promise<void> {
        try {
            // Get current configuration
            const vsConfig = vscode.workspace.getConfiguration(MCPManager.CONFIG_SECTION)
            const mcpServers = { ...vsConfig.get<Record<string, any>>(MCPManager.MCP_SERVERS_KEY, {}) }

            // Check if server exists
            if (!mcpServers[name]) {
                throw new Error(`MCP server "${name}" does not exist`)
            }

            // Remove the disabled flag
            mcpServers[name] = {
                ...mcpServers[name],
                disabled: false,
            }

            // Update configuration
            await vsConfig.update(
                MCPManager.MCP_SERVERS_KEY,
                mcpServers,
                vscode.ConfigurationTarget.Global
            )

            // Try to connect to the server
            try {
                await this.addConnection(name, mcpServers[name])
                logDebug('MCPManager', `Enabled and connected to MCP server: ${name}`)
            } catch (error) {
                logDebug('MCPManager', `Enabled MCP server but failed to connect: ${name}`, {
                    verbose: { error },
                })
            }

            // Notify about server changes
            MCPManager.changeNotifications.next({ type: 'server', serverName: name })
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to enable MCP server: ${error instanceof Error ? error.message : String(error)}`
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
        // Clear the static instance
        MCPManager.instance = undefined
        // Notify subscribers that servers have changed
        MCPManager.changeNotifications.next({ type: 'all' })
        logDebug('MCPManager', 'disposed')
    }
}
