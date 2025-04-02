import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { logDebug } from '@sourcegraph/cody-shared'
import type { McpServer } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import * as vscode from 'vscode'

// Re-defined or imported types needed for connection management
// See https://modelcontextprotocol.io/docs/concepts/transports for details on MCP transport types
export type McpTransportType = 'stdio' | 'sse'

export type McpConnection = {
    server: McpServer
    client: Client
    transport: StdioClientTransport | SSEClientTransport
}

export type MCPServerSpec = {
    client: Client
    transport: StdioClientTransport | SSEClientTransport
}

// Event types for connection status changes
export type ConnectionStatusChangeEvent = {
    serverName: string
    status: 'connecting' | 'connected' | 'disconnected'
    error?: string
}

export class MCPConnectionManager {
    private connections: McpConnection[] = []
    private isConnectingFlags: Map<string, boolean> = new Map() // Track connecting state per server
    private lastConnectionAttempt: Map<string, number> = new Map() // Track last connection attempt time
    private static readonly CONNECTION_COOLDOWN = 5000 // 5 second cooldown between connection attempts

    // Event emitter for connection status changes
    private statusChangeEmitter = new vscode.EventEmitter<ConnectionStatusChangeEvent>()
    public onStatusChange = this.statusChangeEmitter.event

    // Creates the appropriate MCP client and transport based on config
    private createMCPClient(name: string, version: string, config: any): MCPServerSpec {
        const client = new Client({
            name,
            version,
        })

        // SSE transport
        if (config.transportType === 'sse') {
            return {
                client,
                transport: new SSEClientTransport(new URL(config.url)),
            }
        }
        // Default to stdio transport
        return {
            client,
            transport: new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: {
                    ...process.env,
                    ...config.env,
                },
                stderr: 'pipe',
            }),
        }
    }

    private setConnectionError(connection: McpConnection, error: string): void {
        const newError = connection.server.error ? `${connection.server.error}\n${error}` : error
        connection.server.error = newError
    }

    public async addConnection(name: string, config: any, disabled?: boolean): Promise<McpConnection> {
        if (this.isConnectingFlags.get(name)) {
            throw new Error(`Already attempting to connect to ${name}`)
        }

        // Check if we've attempted to connect recently
        const lastAttempt = this.lastConnectionAttempt.get(name) || 0
        const now = Date.now()
        if (now - lastAttempt < MCPConnectionManager.CONNECTION_COOLDOWN) {
            const waitTime = (MCPConnectionManager.CONNECTION_COOLDOWN - (now - lastAttempt)) / 1000
            logDebug(
                'MCPConnectionManager',
                `Throttling connection to ${name}, tried too recently (${waitTime.toFixed(1)}s ago)`
            )
            throw new Error(
                `Connection attempt throttled. Please wait ${waitTime.toFixed(
                    1
                )} seconds before retrying.`
            )
        }

        // Record this connection attempt time
        this.lastConnectionAttempt.set(name, now)
        this.isConnectingFlags.set(name, true)

        // Remove existing connection if it exists (e.g., during restart or config update)
        const existingIndex = this.connections.findIndex(conn => conn.server.name === name)
        if (existingIndex !== -1) {
            await this.removeConnection(name)
        }

        let client: Client | undefined
        let transport: StdioClientTransport | SSEClientTransport | undefined
        let connection: McpConnection | undefined

        try {
            ;({ client, transport } = this.createMCPClient(name, '0.0.0', config))

            connection = {
                server: {
                    name,
                    config: JSON.stringify(config),
                    status: 'connecting',
                    disabled: disabled ?? false,
                },
                client,
                transport,
            }
            this.connections.push(connection)
            this.statusChangeEmitter.fire({ serverName: name, status: 'connecting' })

            transport.onclose = () => {
                logDebug('MCPConnectionManager', `Transport closed for "${name}"`)
                const conn = this.connections.find(c => c.server.name === name)
                if (conn && conn.server.status !== 'disconnected') {
                    conn.server.status = 'disconnected'
                    this.statusChangeEmitter.fire({ serverName: name, status: 'disconnected' })
                }
            }

            transport.onerror = (error: { message: string }) => {
                logDebug('MCPConnectionManager', `Transport error for "${name}":`, {
                    verbose: { error },
                })
                const conn = this.connections.find(c => c.server.name === name)
                if (conn) {
                    conn.server.status = 'disconnected'
                    this.setConnectionError(conn, error.message)
                    this.statusChangeEmitter.fire({
                        serverName: name,
                        status: 'disconnected',
                        error: conn.server.error,
                    })
                }
            }

            // Start the transport first
            await transport.start()

            // Handle stderr for stdio transport
            if (config.transportType === 'stdio' && transport instanceof StdioClientTransport) {
                const stderrStream = transport.stderr
                logDebug('MCPConnectionManager', `Connecting to stdio server "${name}"...`, {
                    verbose: { config },
                })

                if (stderrStream) {
                    stderrStream.on('data', (data: Buffer) => {
                        const errorOutput = data.toString()
                        logDebug('MCPConnectionManager', `Server "${name}" stderr:`, {
                            verbose: { errorOutput },
                        })
                        const conn = this.connections.find(c => c.server.name === name)
                        if (conn) {
                            this.setConnectionError(conn, errorOutput)
                            // Don't immediately set to disconnected, wait for connect attempt
                        }
                    })
                } else {
                    logDebug('MCPConnectionManager', `No stderr stream for ${name}`)
                }
            }

            // For SSE transport, just log the connection attempt
            if (config.transportType === 'sse') {
                logDebug('MCPConnectionManager', `Connecting to SSE server "${name}"...`, {
                    verbose: { config },
                })
            }

            // Monkey-patch start method so connect() doesn't try to start it again
            transport.start = async () => {}

            // Connect the client
            await client.connect(transport)

            // Update status on successful connection
            connection.server.status = 'connected'
            connection.server.error = '' // Clear any previous errors (like stderr noise)
            logDebug('MCPConnectionManager', `Connected to MCP server: ${name}`)
            this.statusChangeEmitter.fire({ serverName: name, status: 'connected' })

            return connection
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logDebug('MCPConnectionManager', `Failed to connect to MCP server ${name}`, {
                verbose: { error },
            })

            // Update status with error if connection object was created
            const conn = this.connections.find(c => c.server.name === name)
            if (conn) {
                conn.server.status = 'disconnected'
                this.setConnectionError(conn, errorMessage)
                this.statusChangeEmitter.fire({
                    serverName: name,
                    status: 'disconnected',
                    error: conn.server.error,
                })
            } else if (connection) {
                // If connection object exists but wasn't pushed yet
                connection.server.status = 'disconnected'
                this.setConnectionError(connection, errorMessage)
                this.statusChangeEmitter.fire({
                    serverName: name,
                    status: 'disconnected',
                    error: connection.server.error,
                })
            }

            // Ensure transport is closed if connection failed mid-way
            if (transport) {
                try {
                    await transport.close()
                } catch (closeError) {
                    logDebug(
                        'MCPConnectionManager',
                        `Error closing transport for ${name} after connection failure`,
                        { verbose: { closeError } }
                    )
                }
            }
            // Ensure client is closed if connection failed mid-way
            if (client) {
                try {
                    await client.close()
                } catch (closeError) {
                    logDebug(
                        'MCPConnectionManager',
                        `Error closing client for ${name} after connection failure`,
                        { verbose: { closeError } }
                    )
                }
            }

            throw error // Re-throw the original error
        } finally {
            this.isConnectingFlags.delete(name)
        }
    }

    public async removeConnection(name: string): Promise<void> {
        const index = this.connections.findIndex(conn => conn.server.name === name)
        if (index !== -1) {
            const connection = this.connections[index]
            this.connections.splice(index, 1) // Remove immediately

            try {
                // Attempt to close transport and client gracefully
                // close() is likely idempotent
                await connection.transport.close()
                await connection.client.close()
                logDebug('MCPConnectionManager', `Closed connection for ${name}`)
            } catch (error) {
                logDebug('MCPConnectionManager', `Failed to cleanly close connection for ${name}:`, {
                    verbose: { error },
                })
            } finally {
                // Ensure status is updated even if close fails
                if (connection.server.status !== 'disconnected') {
                    connection.server.status = 'disconnected'
                    this.statusChangeEmitter.fire({ serverName: name, status: 'disconnected' })
                }
            }
        }
    }

    public getConnection(name: string): McpConnection | undefined {
        return this.connections.find(conn => conn.server.name === name)
    }

    public getAllConnections(): McpConnection[] {
        return [...this.connections] // Return a copy
    }

    public async dispose(): Promise<void> {
        const closePromises = this.connections.map(conn => this.removeConnection(conn.server.name))
        await Promise.allSettled(closePromises)
        this.connections = []
        this.statusChangeEmitter.dispose()
    }
}
