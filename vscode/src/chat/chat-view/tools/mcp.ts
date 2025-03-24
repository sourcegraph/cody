import * as fs from 'node:fs/promises'

import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
    StdioClientTransport,
    type StdioServerParameters,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import {
    CallToolResultSchema,
    ListResourceTemplatesResultSchema,
    ListResourcesResultSchema,
    ListToolsResultSchema,
    ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
    FeatureFlag,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    logDebug,
    startWith,
} from '@sourcegraph/cody-shared'
import type {
    McpResource,
    McpResourceTemplate,
    McpServer,
    McpTool,
} from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { type Observable, Subject, map } from 'observable-fns'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { z } from 'zod'
import type { AgentTool } from '.'
import { createFileWatchers, tryCreateCodyJSON } from '../../../commands/utils/config-file'

// Connection type for MCP servers
export type McpConnection = {
    server: McpServer
    client: Client
    transport: StdioClientTransport
}

// Configuration schemas
const AutoApproveSchema = z.array(z.string()).default([])

const StdioConfigSchema = z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    autoApprove: AutoApproveSchema.optional(),
    disabled: z.boolean().optional(),
})

const McpSettingsSchema = z.object({
    mcpServers: z.record(StdioConfigSchema),
})

export class MCPManager {
    public static instance: MCPManager | undefined
    public static tools: AgentTool[] = []
    private static ConfigFile: URI

    private connections: McpConnection[] = []
    private isConnecting = false
    private disposables: vscode.Disposable[] = []

    // Add this line to create an event emitter
    private static toolsEmitter = new vscode.EventEmitter<AgentTool[]>()

    private static changeNotifications = new Subject<void>()
    public static observable: Observable<McpServer[]> = combineLatest(
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.NextAgenticChatInternal),
        this.changeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([mcpEnabled]) => {
            if (!mcpEnabled) {
                return []
            }
            return MCPManager.instance?.getServers() || []
        }),
        distinctUntilChanged(
            (prev, curr) =>
                JSON.stringify(prev.map(c => c.tools)) === JSON.stringify(curr.map(c => c.tools))
        )
    )

    private watcher: vscode.FileSystemWatcher | undefined

    constructor(globalStorageUri: URI) {
        const joinedPath = path.join(globalStorageUri.fsPath, 'mcp.json')
        MCPManager.ConfigFile = URI.file(joinedPath)
        vscode.window.showTextDocument(MCPManager.ConfigFile)
        this.init()
    }

    public static async init(globalStorageUri: URI): Promise<MCPManager | undefined> {
        return new MCPManager(globalStorageUri)
    }

    private async init(): Promise<void> {
        try {
            await tryCreateCodyJSON(MCPManager.ConfigFile)
            const doc = await vscode.workspace.openTextDocument(MCPManager.ConfigFile)
            const content = doc.getText()
            await this.serversInit(content)
            this.observeSettingsFile()
            MCPManager.instance = this
        } catch (error) {
            logDebug('MCPManager', 'Failed to initialize MCP manager', { verbose: { error } })
            MCPManager.instance = undefined
        }
    }

    private observeSettingsFile(): void {
        // Exit if watcher already exists
        if (this.watcher) return
        // Watch for changes to the settings file
        const watcher = createFileWatchers(MCPManager.ConfigFile)
        if (watcher) {
            this.watcher = watcher
            watcher.onDidChange(async () => {
                try {
                    logDebug('MCPManager', 'Reloading settings...')
                    await vscode.workspace.openTextDocument(MCPManager.ConfigFile).then(async doc => {
                        const content = doc.getText()
                        await this.serversInit(content)
                    })
                } catch (error) {
                    logDebug('MCPManager', 'Error reloading settings', { verbose: { error } })
                }
            })
            this.disposables.push(watcher)
        }
    }

    private async serversInit(content: string): Promise<void> {
        try {
            const config = JSON.parse(content)
            const result = McpSettingsSchema.safeParse(config)

            if (result.success) {
                await this.sync(result.data.mcpServers || {})
                vscode.window.showInformationMessage('MCP servers initialized successfully')
            } else {
                vscode.window.showErrorMessage('Invalid MCP settings format')
            }
        } catch (error) {
            logDebug('MCPManager', 'Failed to initialize MCP servers', { verbose: { error } })
        }
    }

    private async sync(newServers: Record<string, any>): Promise<void> {
        logDebug('MCPManager', 'Syncing MCP servers', { verbose: { newServers } })
        const currentNames = new Set(this.connections.map(conn => conn.server.name))
        const newNames = new Set(Object.keys(newServers))

        // Delete removed servers
        for (const name of currentNames) {
            if (!newNames.has(name)) {
                await this.removeConnection(name)
                logDebug('MCPManager', `Deleted MCP server: ${name}`)
            }
        }

        // Update or add servers
        for (const [name, config] of Object.entries(newServers)) {
            const currentConnection = this.connections.find(conn => conn.server.name === name)

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
                    await this.removeConnection(name)
                    await this.addConnection(name, config)
                    logDebug('MCPManager', `Reconnected MCP server with updated config: ${name}`)
                } catch (error) {
                    logDebug('MCPManager', `Failed to reconnect MCP server ${name}`, {
                        verbose: { error },
                    })
                }
            }
        }
    }

    private async addConnection(name: string, config: StdioServerParameters): Promise<void> {
        if (this.isConnecting) return

        this.isConnecting = true

        // Remove existing connection if it exists
        this.connections = this.connections.filter(conn => conn.server.name !== name)

        try {
            const { client, transport } = createMCPClient(name, '0.0.0', config)

            transport.onerror = (error: { message: string }) => {
                logDebug('MCPManager', `Transport error for "${name}":`, { verbose: { error } })
                const connection = this.connections.find(conn => conn.server.name === name)
                if (connection) {
                    connection.server.status = 'disconnected'
                    this.setConnectionError(connection, error.message)
                }
            }

            transport.onclose = () => {
                const connection = this.connections.find(conn => conn.server.name === name)
                if (connection) {
                    connection.server.status = 'disconnected'
                }
            }

            // If the config is invalid, show an error
            if (!StdioConfigSchema.safeParse(config).success) {
                logDebug('MCPManager', `Invalid config for "${name}": missing or invalid parameters`)
                const connection: McpConnection = {
                    server: {
                        name,
                        config: JSON.stringify(config),
                        status: 'disconnected',
                        error: 'Invalid config: missing or invalid parameters',
                    },
                    client,
                    transport,
                }
                this.connections.push(connection)
                return
            }

            // Valid schema
            const parsedConfig = StdioConfigSchema.parse(config)
            const connection: McpConnection = {
                server: {
                    name,
                    config: JSON.stringify(config),
                    status: 'connecting',
                    disabled: parsedConfig.disabled,
                },
                client,
                transport,
            }
            this.connections.push(connection)

            // Start transport
            await transport.start()
            const stderrStream = transport.stderr

            logDebug('MCPManager', `Connecting to server "${name}"...`, { verbose: { config } })

            if (stderrStream) {
                stderrStream.on('data', (data: Buffer) => {
                    const errorOutput = data.toString()
                    logDebug('MCPManager', `Server "${name}" stderr:`, { verbose: { errorOutput } })
                    const connection = this.connections.find(conn => conn.server.name === name)
                    if (connection) {
                        this.setConnectionError(connection, errorOutput)
                    }
                })
            } else {
                logDebug('MCPManager', `No stderr stream for ${name}`)
            }

            transport.start = async () => logDebug('MCPManager', 'Transport start called')

            // Connect
            await client.connect(transport)
            connection.server.status = 'connected'
            connection.server.error = ''

            // Initial fetch of tools and resources
            connection.server.tools = await this.getToolList(name)
            connection.server.resources = await this.getResourceList(name)
            connection.server.resourceTemplates = await this.getResourceTemplateList(name)

            vscode.window.showInformationMessage(`Connected to MCP server: ${name}`)
        } catch (error) {
            // Update status with error
            const connection = this.connections.find(conn => conn.server.name === name)
            if (connection) {
                connection.server.status = 'disconnected'
                this.setConnectionError(
                    connection,
                    error instanceof Error ? error.message : String(error)
                )
            }
            throw error
        } finally {
            this.isConnecting = false
        }
    }

    private setConnectionError(connection: McpConnection, error: string) {
        const newError = connection.server.error ? `${connection.server.error}\n${error}` : error
        connection.server.error = newError
    }

    private async removeConnection(name: string): Promise<void> {
        const connection = this.connections.find(conn => conn.server.name === name)
        if (connection) {
            try {
                await connection.transport.close()
                await connection.client.close()
            } catch (error) {
                logDebug('MCPManager', `Failed to close transport for ${name}:`, { verbose: { error } })
            }
            this.connections = this.connections.filter(conn => conn.server.name !== name)
        }
    }

    private updateTools(tools: AgentTool[]): void {
        MCPManager.tools = tools
        MCPManager.toolsEmitter.fire(MCPManager.tools)
    }

    public static onToolsChanged(listener: (tools: AgentTool[]) => void): vscode.Disposable {
        return MCPManager.toolsEmitter.event(listener)
    }

    /**
     * Tool and resource management
     */
    private async getToolList(serverName: string): Promise<McpTool[]> {
        try {
            const connection = this.connections.find(conn => conn.server.name === serverName)
            if (!connection) return []

            const response = await connection.client.request(
                { method: 'tools/list' },
                ListToolsResultSchema
            )

            if (!response?.tools) return []

            // Mark tools as always allowed based on settings
            const tools =
                response?.tools?.map(tool => ({
                    ...tool,
                    input_schema: tool.inputSchema,
                })) || []

            logDebug('MCPManager', `Fetched ${tools.length} tools for ${serverName}`, {
                verbose: { tools },
            })

            await this.createAgentTools(serverName, tools)

            return tools
        } catch (error) {
            logDebug('MCPManager', `Failed to fetch tools for ${serverName}:`, { verbose: { error } })
            return []
        } finally {
            logDebug('MCPManager', `Tool list retrieval process completed for ${serverName}`)
        }
    }

    /**
     * TODO: Add support for resources - currently not supported.
     * Fetches the list of resource from the MCP server.
     */
    private async getResourceList(serverName: string): Promise<McpResource[]> {
        try {
            if (!serverName) return [] // <-- Skip until we support resources

            const connection = this.connections.find(conn => conn.server.name === serverName)
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
            vscode.window.showInformationMessage(`${resources.length} resources fetched`)
            logDebug('MCPManager', `Fetched ${resources.length} resources for ${serverName}`, {
                verbose: { resources },
            })
            return resources
        } catch (error) {
            logDebug('MCPManager', `Failed to fetch resources for ${serverName}:`, {
                verbose: { error },
            })
            return []
        } finally {
            logDebug('MCPManager', `Resource list retrieval process completed for ${serverName}`)
        }
    }

    /**
     * TODO: Add support for prompts templates
     * NOTE: Currently not supported.
     * Fetches the list of resource templates from the MCP server.
     */
    private async getResourceTemplateList(serverName: string): Promise<McpResourceTemplate[]> {
        try {
            if (serverName) return [] // <-- Skip until we support templates

            const connection = this.connections.find(conn => conn.server.name === serverName)
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
            logDebug('MCPManager', `Failed to fetch resource templates for ${serverName}:`, {
                verbose: { error },
            })
            return []
        }
    }

    private async createAgentTools(serverName: string, tools: McpTool[]): Promise<void> {
        const _agentTools = []
        for (const tool of tools) {
            try {
                // Create an agent tool
                const agentTool: AgentTool = {
                    spec: {
                        name: `${serverName}_${tool.name}`,
                        description: tool.description,
                        input_schema: tool.input_schema,
                    },
                    invoke: async (args: Record<string, any>) => {
                        return this.executeTool(serverName, tool.name, args)
                    },
                }

                _agentTools.push(agentTool)

                logDebug('MCPManager', `Created agent tool for ${tool.name}`, { verbose: { tool } })
            } catch (error) {
                logDebug('MCPManager', `Error creating agent tool for ${tool.name}`, {
                    verbose: { error },
                })
            }
        }

        this.updateTools([
            ...MCPManager.tools.filter(t => !t.spec.name.startsWith(`${serverName}_`)),
            ..._agentTools,
        ])

        vscode.window.showInformationMessage(`${_agentTools.length} tools from ${serverName} created`)
        logDebug('MCPManager', `Created ${_agentTools.length} agent tools from ${serverName}`, {
            verbose: { _agentTools },
        })
    }

    /**
     * Execute a tool from a MCP server
     */
    public async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {}
    ): Promise<any> {
        const connection = this.connections.find(conn => conn.server.name === serverName)
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

            return result.result
        } catch (error) {
            logDebug('MCPManager', `Error calling tool ${toolName} on server ${serverName}`, {
                verbose: { error },
            })
            throw error
        }
    }

    /**
     * Read a resource from an MCP server
     */
    public async readResource(serverName: string, uri: string): Promise<any> {
        const connection = this.connections.find(conn => conn.server.name === serverName)
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
            logDebug('MCPManager', `Error reading resource ${uri} from server ${serverName}`, {
                verbose: { error },
            })
            throw error
        }
    }

    /**
     * Get all available MCP servers
     */
    public getServers(): McpServer[] {
        return this.connections.map(conn => conn.server)
    }

    /**
     * Restart a MCP server connection
     */
    public async restartServer(serverName: string): Promise<void> {
        const connection = this.connections.find(conn => conn.server.name === serverName)
        if (!connection) {
            this.isConnecting = false
            throw new Error(`MCP server "${serverName}" not found`)
        }

        const config = connection.server.config
        if (config) {
            vscode.window.showInformationMessage(`Restarting ${serverName} MCP server...`)
            connection.server.status = 'connecting'
            connection.server.error = ''

            try {
                await this.deleteServer(serverName)
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
            const content = await fs.readFile(MCPManager.ConfigFile.toString(), 'utf-8')
            const config = JSON.parse(content)

            if (!config.mcpServers || typeof config.mcpServers !== 'object') {
                config.mcpServers = {}
            }

            if (config.mcpServers[serverName]) {
                delete config.mcpServers[serverName]

                const updatedConfig = {
                    mcpServers: config.mcpServers,
                }

                await fs.writeFile(
                    MCPManager.ConfigFile.toString(),
                    JSON.stringify(updatedConfig, null, 2)
                )
                await this.sync(config.mcpServers)
                vscode.window.showInformationMessage(`Deleted ${serverName} MCP server`)
            } else {
                vscode.window.showWarningMessage(`${serverName} not found in MCP configuration`)
            }
        } catch (error) {
            logDebug('MCPManager', `Failed to delete MCP server: ${serverName}`, { verbose: { error } })
            vscode.window.showErrorMessage(
                `Failed to delete MCP server: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    // Add a new MCP server
    public async addServer(name: string, config: StdioServerParameters): Promise<void> {
        try {
            const content = await fs.readFile(MCPManager.ConfigFile.toString(), 'utf-8')
            const currentConfig = JSON.parse(content)

            if (!currentConfig.mcpServers || typeof currentConfig.mcpServers !== 'object') {
                currentConfig.mcpServers = {}
            }

            // Check if server already exists
            if (currentConfig.mcpServers[name]) {
                throw new Error(`An MCP server named "${name}" already exists`)
            }

            // Validate config
            const result = StdioConfigSchema.safeParse(config)
            if (!result.success) {
                throw new Error('Invalid server configuration')
            }

            // Add the new server
            currentConfig.mcpServers[name] = config

            // Write the updated config
            await fs.writeFile(MCPManager.ConfigFile.toString(), JSON.stringify(currentConfig, null, 2))

            // Connect to the new server
            await this.addServer(name, config)

            vscode.window.showInformationMessage(`Added MCP server: ${name}`)
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add MCP server: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    // Clean up resources
    public async dispose(): Promise<void> {
        // Close all connections
        for (const connection of this.connections) {
            try {
                await this.deleteServer(connection.server.name)
            } catch (error) {
                logDebug('MCPManager', `Failed to close connection for ${connection.server.name}`, {
                    verbose: { error },
                })
            }
        }

        // Dispose all disposables
        for (const disposable of this.disposables) {
            disposable.dispose()
        }

        this.connections = []
        this.disposables = []
    }
}

export function createMCPClient(
    name: string,
    version: string,
    config: StdioServerParameters
): { client: Client; transport: StdioClientTransport } {
    return {
        client: new Client({
            name,
            version,
        }),
        transport: new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: {
                ...config.env,
                ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
            },
            stderr: 'pipe',
        }),
    }
}
