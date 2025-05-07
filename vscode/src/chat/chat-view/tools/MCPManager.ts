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

// Debounce function to prevent rapid consecutive calls
function debounce<T extends (...args: any[]) => Promise<void>>(
    func: T,
    wait: number
): (...args: Parameters<T>) => Promise<void> {
    let timeout: NodeJS.Timeout | null = null
    let pendingPromise: Promise<void> | null = null

    return async (...args: Parameters<T>): Promise<void> => {
        // Clear the previous timeout
        if (timeout) {
            clearTimeout(timeout)
        }

        // Create a new promise or return the pending one
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

// Configuration schemas
const AutoApproveSchema = z.array(z.string()).default([])

// Base schema with common properties
const BaseConfigSchema = z.object({
    autoApprove: AutoApproveSchema.optional(),
    disabled: z.boolean().optional(),
    // Error messages
    error: z.string().optional(),
})

// Schema for configs with a URL (SSE)
const SseConfigSchema = BaseConfigSchema.extend({
    transportType: z.literal('sse').optional().default('sse'),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    withCredentials: z.boolean().optional().default(false),
})

// Schema for configs with a command (stdio)
const StdioConfigSchema = BaseConfigSchema.extend({
    transportType: z.literal('stdio').optional().default('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
})

// Combined schema that detects the type based on presence of url or command
const ServerConfigSchema = z.union([
    // If it has a url, it's an SSE config
    SseConfigSchema,
    // Otherwise, it's a stdio config
    StdioConfigSchema,
])

const McpSettingsSchema = z.object({
    mcpServers: z.record(ServerConfigSchema),
})

/**
 * Main MCP Manager class that coordinates connection and server management
 */
export class MCPManager {
    public static instance: MCPManager | undefined
    private static readonly CONFIG_SECTION = 'cody'
    private static readonly MCP_SERVERS_KEY = 'mcpServers'
    private static readonly DEBOUNCE_TIMEOUT = 1000 // 1 second debounce timeout

    private connectionManager: MCPConnectionManager
    public serverManager: MCPServerManager
    private disposables: vscode.Disposable[] = []
    private debouncedSync: (mcpServers: Record<string, any>) => Promise<void>

    private static changeNotifications = new Subject<void>()
    private static toolsChangeNotifications = new Subject<void>()
    public static observable: Observable<McpServer[]> = combineLatest(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.NextAgenticChatInternal),
        this.changeNotifications.pipe(startWith(undefined)),
        this.toolsChangeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([mcpEnabled]) => {
            // Return empty array if feature is disabled OR if the instance has been disposed
            if (!mcpEnabled || !MCPManager.instance) {
                return []
            }
            return MCPManager.instance.getServers() || []
        }),
        distinctUntilChanged((prev, curr) => {
            // Check if the servers or their tools have changed
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
        this.connectionManager.onStatusChange(event => {
            if (event.status === 'connected') {
                // When a server connects, fetch its tools and resources
                this.initializeServerData(event.serverName).catch(error => {
                    logDebug('MCPManager', `Error initializing server data for ${event.serverName}`, {
                        verbose: { error },
                    })
                })
            }
            const conn = this.connectionManager.getConnection(event.serverName)
            if (conn && event.error && conn.server.error) {
                // Update the error message for the server without saving them in user config
                conn.server.error = event.error
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
                logDebug('MCPManager', 'Reloading settings from configuration (debounced)...')
                // Use the loadServersFromConfig which internally uses the debounced sync
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
                // Use debounced sync to prevent rapid consecutive syncs
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
            // Determine if this is an SSE config based on presence of url
            const isSSE = 'url' in config
            // Set the transport type based on the detected type
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
            const parsedConfig = result.data
            // Add the connection (respect the disabled flag)
            await this.connectionManager.addConnection(name, configWithDefaults, parsedConfig?.disabled)

            MCPManager.changeNotifications.next()
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

        MCPManager.toolsChangeNotifications.next()
        MCPManager.changeNotifications.next()

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

        // Fetch resource templates - currently not supported
        try {
            const resourceTemplates = await this.serverManager.getResourceTemplateList(serverName)
            connection.server.resourceTemplates = resourceTemplates
            logDebug('MCPManager', `Initialized resource templates for server: ${serverName}`)
        } catch (error) {
            logDebug('MCPManager', `Failed to initialize resource templates for server ${serverName}`, {
                verbose: { error },
            })
        }

        // Notify about server changes regardless of individual fetch outcomes
        MCPManager.toolsChangeNotifications.next()
        MCPManager.changeNotifications.next()
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
    ): Promise<ContextItemToolState> {
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
                const parsedConfig = JSON.parse(config)
                const isSSE = parsedConfig.url !== undefined
                parsedConfig.transportType = isSSE ? 'sse' : 'stdio'
                // Try to connect again using existing config
                await this.addConnection(serverName, parsedConfig)
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

            // Connect only the new server
            await this.addConnection(name, config)
            logDebug('MCPManager', `Added MCP server: ${name}`, { verbose: { config } })

            // Notify about server changes
            MCPManager.changeNotifications.next()
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

            // Update the server configuration
            // Do not store the error message in config
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

            // Notify about server changes
            MCPManager.changeNotifications.next()
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to update MCP server: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    // Disable an MCP server
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
            // Notify about server changes
            MCPManager.changeNotifications.next()
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to disable MCP server: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    // Enable an MCP server
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
            MCPManager.changeNotifications.next()
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
        MCPManager.changeNotifications.next()
        logDebug('MCPManager', 'disposed')
    }
}
