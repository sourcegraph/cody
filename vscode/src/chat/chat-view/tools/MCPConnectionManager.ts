import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { logDebug } from '@sourcegraph/cody-shared'
import type {
    McpConnectionStatus,
    McpServer,
} from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { Subject } from 'observable-fns'
import * as vscode from 'vscode'

// See https://modelcontextprotocol.io/docs/concepts/transports for details on MCP transport types
export type McpTransportType = 'stdio' | 'sse'
export type McpTransport = StdioClientTransport | SSEClientTransport

export type McpConnection = {
    server: McpServer
    client: Client
    transport: McpTransport
}

export type MCPServerSpec = {
    client: Client
    transport: McpTransport
}

export type ConnectionStatusChangeEvent = {
    serverName: string
    status: McpConnectionStatus
    error?: string
}

export type ServerChangeNotification = {
    type: 'server' | 'tool'
    serverName?: string
}

export class MCPConnectionManager {
    public static instance: MCPConnectionManager = new MCPConnectionManager()

    private connections: McpConnection[] = []

    private statusChangeEmitter = new vscode.EventEmitter<ConnectionStatusChangeEvent>()
    public onStatusChange = this.statusChangeEmitter.event

    private serverChangeNotifications = new Subject<ServerChangeNotification>()
    public readonly serverChanges = this.serverChangeNotifications

    public notifyServerChanged(serverName?: string): void {
        this.serverChangeNotifications.next({ type: 'server', serverName })
    }

    public notifyToolChanged(serverName?: string): void {
        this.serverChangeNotifications.next({ type: 'tool', serverName })
    }

    private createMCPClient(name: string, version: string, config: any): MCPServerSpec {
        const client = new Client({ name, version })

        if (config.transportType === 'sse') {
            return {
                client,
                transport: new SSEClientTransport(new URL(config.url)),
            }
        }

        return {
            client,
            transport: new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: { ...process.env, ...config.env },
                stderr: 'pipe',
            }),
        }
    }

    private setConnectionError(connection: McpConnection, error: string): void {
        connection.server.error = connection.server.error
            ? `${connection.server.error}\n${error}`
            : error
    }

    private updateConnectionStatus(
        connection: McpConnection,
        status: McpConnectionStatus,
        error?: string
    ): void {
        const { name } = connection.server

        connection.server.status = status

        if (error) {
            this.setConnectionError(connection, error)
        }

        this.statusChangeEmitter.fire({
            serverName: name,
            status,
            error: connection.server.error,
        })

        this.notifyServerChanged(name)
    }

    public async addConnection(name: string, config: any, disabled = false): Promise<McpConnection> {
        // Remove existing connection if it exists
        const existingIndex = this.connections.findIndex(conn => conn.server.name === name)
        if (existingIndex !== -1) {
            await this.removeConnection(name)
        }

        let client: Client | undefined
        let transport: McpTransport | undefined
        let connection: McpConnection | undefined

        try {
            ;({ client, transport } = this.createMCPClient(name, '0.0.0', config))

            connection = {
                server: {
                    name,
                    config: JSON.stringify(config),
                    status: 'connecting',
                    disabled,
                },
                client,
                transport,
            }

            this.connections.push(connection)
            this.statusChangeEmitter.fire({ serverName: name, status: 'connecting' })

            // Set up transport event handlers
            transport.onclose = () => {
                logDebug('MCPConnectionManager', `Transport closed for "${name}"`)
                const conn = this.getConnection(name)
                if (conn && conn.server.status !== 'disconnected') {
                    this.updateConnectionStatus(conn, 'disconnected', 'Transport closed')
                }
            }

            transport.onerror = (error: { message: string }) => {
                logDebug('MCPConnectionManager', `Transport error for "${name}"`, {
                    verbose: { error },
                })
                const conn = this.getConnection(name)
                if (conn) {
                    this.updateConnectionStatus(conn, 'disconnected', error.message)
                }
            }

            // Connect to the server
            await transport.start()

            // Log connection attempt info
            if (config.transportType === 'stdio' && transport instanceof StdioClientTransport) {
                logDebug('MCPConnectionManager', `Connecting to stdio server "${name}"...`, {
                    verbose: { config },
                })
            } else if (config.transportType === 'sse') {
                logDebug('MCPConnectionManager', `Connecting to SSE server "${name}"...`, {
                    verbose: { config },
                })
            }

            // Prevent double-starting the transport
            transport.start = async () => {}

            // Connect the client
            await client.connect(transport)

            // Update connection status on success
            connection.server.status = 'connected'
            connection.server.error = '' // Clear previous errors

            logDebug('MCPConnectionManager', `Connected to MCP server: ${name}`)
            this.statusChangeEmitter.fire({ serverName: name, status: 'connected' })
            this.notifyServerChanged(name)

            return connection
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logDebug('MCPConnectionManager', `Failed to connect to MCP server ${name}`, {
                verbose: { error },
            })

            // Update connection status with error
            const conn = this.getConnection(name) ?? connection
            if (conn) {
                this.updateConnectionStatus(conn, 'disconnected', errorMessage)
            }

            // Clean up resources on failure
            await Promise.allSettled([
                transport
                    ?.close()
                    .catch(closeError =>
                        logDebug(
                            'MCPConnectionManager',
                            `Error closing transport for ${name} after connection failure`,
                            { verbose: { closeError } }
                        )
                    ),
                client
                    ?.close()
                    .catch(closeError =>
                        logDebug(
                            'MCPConnectionManager',
                            `Error closing client for ${name} after connection failure`,
                            { verbose: { closeError } }
                        )
                    ),
            ])

            throw error // Re-throw the original error
        }
    }

    public async removeConnection(name: string): Promise<void> {
        const index = this.connections.findIndex(conn => conn.server.name === name)
        if (index === -1) return

        const connection = this.connections[index]
        this.connections.splice(index, 1) // Remove immediately

        try {
            // Close transport and client gracefully
            await Promise.all([connection.transport.close(), connection.client.close()])
            logDebug('MCPConnectionManager', `Closed connection for ${name}`)
        } catch (error) {
            logDebug('MCPConnectionManager', `Failed to cleanly close connection for ${name}:`, {
                verbose: { error },
            })
        }

        this.statusChangeEmitter.fire({ serverName: name, status: 'removed' })
        this.notifyServerChanged(name)
    }

    public updateConnectionError(serverName: string, error: string): void {
        const conn = this.getConnection(serverName)
        if (conn) {
            this.setConnectionError(conn, error)
            this.notifyServerChanged(serverName)
        }
    }

    public getConnection(name: string): McpConnection | undefined {
        return this.connections.find(conn => conn.server.name === name)
    }

    public getAllConnections(): McpConnection[] {
        return [...this.connections].sort((a, b) => a.server.name.localeCompare(b.server.name))
    }

    public async dispose(): Promise<void> {
        await Promise.allSettled(this.connections.map(conn => this.removeConnection(conn.server.name)))
        this.connections = []
        this.statusChangeEmitter.dispose()
        this.notifyServerChanged() // Notify about complete server reset
    }
}
