import { logDebug, logError } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { MCPManager } from './MCPManager'

/**
 * Register MCP-related commands
 */
export function registerMCPCommands(disposables: vscode.Disposable[]): void {
    // Command to add a new MCP server
    disposables.push(
        vscode.commands.registerCommand('cody.mcp.addServer', async (argString?: string) => {
            try {
                if (!argString) {
                    throw new Error('No server configuration provided')
                }

                const args = JSON.parse(argString)
                const { name, config } = args

                if (!name || !config) {
                    throw new Error('Invalid server configuration: missing name or config')
                }

                // Get the MCP manager instance
                const mcpManager = MCPManager.instance
                if (!mcpManager) {
                    throw new Error('MCP Manager is not initialized')
                }

                // Add the server
                await mcpManager.addServer(name, config)
                logDebug('MCPCommands', `Added MCP server: ${name}`)

                return { success: true }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                logError('MCPCommands', `Failed to add MCP server: ${errorMessage}`)
                throw error
            }
        })
    )

    // Command to remove an MCP server
    disposables.push(
        vscode.commands.registerCommand('cody.mcp.removeServer', async (name?: string) => {
            try {
                if (!name) {
                    throw new Error('No server name provided')
                }

                // Get the MCP manager instance
                const mcpManager = MCPManager.instance
                if (!mcpManager) {
                    throw new Error('MCP Manager is not initialized')
                }

                // Delete the server
                await mcpManager.deleteServer(name)
                logDebug('MCPCommands', `Removed MCP server: ${name}`)

                return { success: true }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                logError('MCPCommands', `Failed to remove MCP server: ${errorMessage}`)
                throw error
            }
        })
    )

    // Command to disable/enable an MCP server
    disposables.push(
        vscode.commands.registerCommand(
            'cody.mcp.toggleServerStatus',
            async (args?: { name: string; disable: boolean }) => {
                try {
                    if (!args || !args.name) {
                        throw new Error('No server name provided')
                    }

                    // Get the MCP manager instance
                    const mcpManager = MCPManager.instance
                    if (!mcpManager) {
                        throw new Error('MCP Manager is not initialized')
                    }

                    // Toggle server status (disable/enable)
                    if (args.disable) {
                        await mcpManager.disableServer(args.name)
                        logDebug('MCPCommands', `Disabled MCP server: ${args.name}`)
                    } else {
                        await mcpManager.enableServer(args.name)
                        logDebug('MCPCommands', `Enabled MCP server: ${args.name}`)
                    }

                    return { success: true }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error)
                    logError('MCPCommands', `Failed to toggle MCP server status: ${errorMessage}`)
                    throw error
                }
            }
        )
    )

    // Command to restart an MCP server
    disposables.push(
        vscode.commands.registerCommand('cody.mcp.restartServer', async (name?: string) => {
            try {
                if (!name) {
                    throw new Error('No server name provided')
                }

                // Get the MCP manager instance
                const mcpManager = MCPManager.instance
                if (!mcpManager) {
                    throw new Error('MCP Manager is not initialized')
                }

                // Restart the server
                await mcpManager.restartServer(name)
                logDebug('MCPCommands', `Restarted MCP server: ${name}`)

                return { success: true }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                logError('MCPCommands', `Failed to restart MCP server: ${errorMessage}`)
                throw error
            }
        })
    )
}
