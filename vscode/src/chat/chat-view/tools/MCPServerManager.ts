import {
    CallToolResultSchema,
    ListResourceTemplatesResultSchema,
    ListResourcesResultSchema,
    ListToolsResultSchema,
    ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { ContextItemSource, type MessagePart, UIToolStatus, logDebug } from '@sourcegraph/cody-shared'
import type {
    McpResource,
    McpResourceTemplate,
    McpTool,
} from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { Subject } from 'observable-fns'
import * as vscode from 'vscode'
import type { AgentTool } from '.'
import { CodyToolProvider } from '../../../chat/agentic/CodyToolProvider'

import type {
    ContextItem,
    ContextItemToolState,
} from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { URI } from 'vscode-uri'
import { getImageContent } from '../../../prompt-builder/utils'
import type { MCPConnectionManager } from './MCPConnectionManager'

/**
 * MCPServerManager handles server-specific operations like tool and resource management
 */
export class MCPServerManager {
    // Event emitter for tool changes
    private toolsEmitter = new vscode.EventEmitter<{
        serverName: string
        toolName?: string
        tools: AgentTool[]
    }>()
    private tools: AgentTool[] = []
    private disabledTools: Set<string> = new Set<string>()
    private toolStateChangeEmitter = new vscode.EventEmitter<{
        serverName: string
        toolName: string
        disabled: boolean
    }>()
    private toolsChangeNotifications = new Subject<{ serverName: string; toolName?: string }>()

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

            // Register tools with CodyToolProvider
            try {
                CodyToolProvider.registerMcpTools(serverName, tools)
                logDebug('MCPServerManager', `Registered ${tools.length} tools with CodyToolProvider`)
            } catch (error) {
                logDebug(
                    'MCPServerManager',
                    `Failed to register tools with CodyToolProvider: ${error}`,
                    {
                        verbose: { error },
                    }
                )
            }

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
     * TODO: Add support for prompts templates - currently not supported.
     * NOTE: Currently not supported.
     * Fetches the list of resource templates from the MCP server.
     */
    public async getResourceTemplateList(serverName: string): Promise<McpResourceTemplate[]> {
        try {
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
                // Determine if the tool is disabled
                const isDisabled = this.disabledTools.has(`${serverName}_${tool.name}`)

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
                            throw error
                        }
                    },
                    // Set disabled based on current state
                    disabled: isDisabled,
                }

                _agentTools.push(agentTool)

                // Also update the disabled state in the server's tool directly
                const connection = this.connectionManager.getConnection(serverName)
                if (connection?.server.tools) {
                    connection.server.tools = connection.server.tools.map(t => {
                        if (t.name === tool.name) {
                            return { ...t, disabled: isDisabled }
                        }
                        return t
                    })
                }

                logDebug('MCPServerManager', `Created agent tool for ${tool.name || ''}`, {
                    verbose: { tool },
                })
            } catch (error) {
                logDebug('MCPServerManager', `Error creating agent tool for ${tool.name || ''}`, {
                    verbose: { error },
                })
            }
        }

        // Only remove and update tools for this specific server
        this.updateTools(
            [...this.tools.filter(t => !t.spec.name.startsWith(`${serverName}_`)), ..._agentTools],
            serverName
        )

        logDebug('MCPServerManager', `Created ${_agentTools.length} agent tools from ${serverName}`, {
            verbose: { _agentTools },
        })
    }

    /**
     * Update the list of available tools
     */
    private updateTools(tools: AgentTool[], serverName?: string, toolName?: string): void {
        this.tools = tools
        this.toolsEmitter.fire({ serverName: serverName || '', toolName, tools: this.tools })
        // Trigger change notification to update observable with specific info
        this.toolsChangeNotifications.next({ serverName: serverName || '', toolName })
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
    public onToolsChanged(
        listener: (event: { serverName: string; toolName?: string; tools: AgentTool[] }) => void
    ): vscode.Disposable {
        return this.toolsEmitter.event(listener)
    }

    /**
     * Execute a tool from a MCP server
     */
    public async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {}
    ): Promise<ContextItemToolState> {
        // Check if tool is disabled
        if (this.disabledTools.has(`${serverName}_${toolName}`)) {
            throw new Error(`Tool "${toolName}" is disabled`)
        }
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

            const { context, contents } = transforMCPToolResult(result.content, toolName)

            logDebug('MCPServerManager', `Tool ${toolName} executed successfully`, {
                verbose: { context, contents },
            })

            return createMCPToolState(serverName, toolName, contents, context)
        } catch (error) {
            logDebug('MCPServerManager', `Error calling tool ${toolName} on server ${serverName}`, {
                verbose: error,
            })

            // Create an error state instead of throwing
            const errorMessage = error instanceof Error ? error.message : String(error)
            return createMCPToolState(
                serverName,
                toolName,
                [{ type: 'text', text: `[${toolName}] ERROR: ${errorMessage}` }],
                undefined,
                UIToolStatus.Error
            )
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
     * Enable or disable a tool
     */
    public setToolState(serverName: string, toolName: string, disabled: boolean): void {
        const fullToolName = `${serverName}_${toolName}`

        if (disabled) {
            this.disabledTools.add(fullToolName)
        } else {
            this.disabledTools.delete(fullToolName)
        }

        // Update the disabled state of the tool in the tools list
        this.tools = this.tools.map(tool => {
            if (tool.spec.name === fullToolName) {
                return {
                    ...tool,
                    disabled,
                }
            }
            return tool
        })

        // Also update the tool in the server object directly
        const connection = this.connectionManager.getConnection(serverName)
        if (connection?.server.tools) {
            connection.server.tools = connection.server.tools.map(tool => {
                if (tool.name === toolName) {
                    return { ...tool, disabled }
                }
                return tool
            })
        }

        // Fire events with specific server and tool information
        this.toolsEmitter.fire({ serverName, toolName, tools: this.tools })
        this.toolStateChangeEmitter.fire({ serverName, toolName, disabled })
        this.toolsChangeNotifications.next({ serverName, toolName })
    }

    /**
     * Get all disabled tools
     */
    public getDisabledTools(): string[] {
        return Array.from(this.disabledTools)
    }

    /**
     * Set disabled tools
     */
    public setDisabledTools(tools: string[], append = false): void {
        if (append) {
            // Add to existing set instead of replacing
            for (const tool of tools) {
                this.disabledTools.add(tool)
            }
        } else {
            // Replace the entire set
            this.disabledTools = new Set(tools)
        }

        // Update the tools list with disabled state
        this.tools = this.tools.map(tool => ({
            ...tool,
            disabled: this.disabledTools.has(tool.spec.name),
        }))

        // Get affected server names from the tool names
        const affectedServers = new Set(tools.map(t => t.split('_')[0]).filter(Boolean))

        // Update tools in the server objects directly
        for (const serverName of affectedServers) {
            const connection = this.connectionManager.getConnection(serverName)
            if (connection?.server.tools) {
                connection.server.tools = connection.server.tools.map(tool => {
                    const fullToolName = `${serverName}_${tool.name}`
                    return {
                        ...tool,
                        disabled: this.disabledTools.has(fullToolName),
                    }
                })
            }
        }

        this.toolsEmitter.fire({
            serverName: affectedServers.size === 1 ? Array.from(affectedServers)[0] : '',
            tools: this.tools,
        })
        this.toolsChangeNotifications.next({
            serverName: affectedServers.size === 1 ? Array.from(affectedServers)[0] : '',
        })
    }

    /**
     * Subscribe to tool state changes
     */
    public onToolStateChanged(
        listener: (event: { serverName: string; toolName: string; disabled: boolean }) => void
    ): vscode.Disposable {
        return this.toolStateChangeEmitter.event(listener)
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.toolsEmitter.dispose()
        this.toolStateChangeEmitter.dispose()
    }
}

/**
 * Transform tool execution result content into context items and message parts
 */
export function transforMCPToolResult(
    content: any[],
    toolName: string
): { context: ContextItem[]; contents: MessagePart[] } {
    const context: ContextItem[] = []
    const contents: MessagePart[] = []

    for (const p of content || []) {
        if (p?.type === 'text') {
            contents.push({ type: 'text', text: p.text || 'EMPTY' })
        } else if (p?.type === 'image') {
            const mimeType = p.mimeType || 'image/png'

            context.push({
                type: 'media',
                title: `${toolName}_result`,
                uri: URI.parse(''),
                mimeType: mimeType,
                filename: 'mcp_tool_result',
                data: p.data,
                content: 'tool result',
            })

            const imageContent = getImageContent(p.data, mimeType)
            contents.push(imageContent)
        } else {
            contents.push({
                type: 'text',
                text: `${toolName} returned unsupported result type: ${p.type}`,
            })
        }
    }

    return { context, contents }
}

/**
 * Create a tool state object from MCP tool execution result
 */
export function createMCPToolState(
    serverName: string,
    toolName: string,
    parts: MessagePart[],
    context?: ContextItem[],
    status = UIToolStatus.Done
): ContextItemToolState {
    const textContent = parts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n')

    return {
        type: 'tool-state',
        toolId: `mcp-${toolName}-${Date.now()}`,
        status,
        toolName: `${serverName}_${toolName}`,
        content: `<TOOLRESULT tool='${toolName}'>${textContent}\n[Please communicate the result to the user]</TOOLRESULT>`,
        outputType: 'mcp',
        uri: URI.parse(''),
        title: serverName + ' - ' + toolName,
        description: textContent,
        source: ContextItemSource.Agentic,
        icon: 'database',
        metadata: ['mcp', toolName],
        parts,
        context,
    }
}
