import {
    CallToolResultSchema,
    ListResourceTemplatesResultSchema,
    ListResourcesResultSchema,
    ListToolsResultSchema,
    ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { type MessagePart, logDebug } from '@sourcegraph/cody-shared'
import type {
    McpResource,
    McpResourceTemplate,
    McpTool,
} from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { Subject } from 'observable-fns'
import * as vscode from 'vscode'
import type { AgentTool } from '.'

import type { MCPConnectionManager } from './MCPConnectionManager'
import { createMCPToolState } from './MCPManager'

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
                        name: `${serverName}_${tool.name}`,
                        description: tool.description || '',
                        input_schema: tool.input_schema || {},
                    },
                    invoke: async (args: Record<string, any>) => {
                        try {
                            return this.executeTool(serverName, tool.name, args)
                        } catch (error) {
                            logDebug('MCPServerManager', `Error executing tool ${tool.name}:`, {
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
