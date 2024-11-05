import { exec } from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

import { type ChatClient, type Message, PromptString } from '@sourcegraph/cody-shared'
import type { Edge } from '../../webviews/workflow/components/CustomOrderedEdge'
import type { WorkflowNode } from '../../webviews/workflow/components/nodes/Nodes'
import type { WorkflowFromExtension } from '../../webviews/workflow/services/WorkflowProtocol'

interface ExecutionContext {
    nodeOutputs: Map<string, string>
}

const execAsync = promisify(exec)

export function topologicalSort(nodes: WorkflowNode[], edges: Edge[]): WorkflowNode[] {
    const graph = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    // Initialize
    for (const node of nodes) {
        graph.set(node.id, [])
        inDegree.set(node.id, 0)
    }

    // Build graph
    for (const edge of edges) {
        graph.get(edge.source)?.push(edge.target)
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    // Find nodes with no dependencies but sort them based on their edge connections
    const sourceNodes = nodes.filter(node => inDegree.get(node.id) === 0)

    // Sort source nodes based on edge order
    const sortedSourceNodes = sourceNodes.sort((a, b) => {
        const aEdgeIndex = edges.findIndex(edge => edge.source === a.id)
        const bEdgeIndex = edges.findIndex(edge => edge.source === b.id)
        return aEdgeIndex - bEdgeIndex
    })

    const queue = sortedSourceNodes.map(node => node.id)
    const result: string[] = []

    while (queue.length > 0) {
        const nodeId = queue.shift()!
        result.push(nodeId)

        const neighbors = graph.get(nodeId)
        if (neighbors) {
            for (const neighbor of neighbors) {
                inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1)
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor)
                }
            }
        }
    }

    return result.map(id => nodes.find(node => node.id === id)!).filter(Boolean)
}

async function executeCLINode(node: WorkflowNode): Promise<string> {
    // Check if shell is available and workspace is trusted
    if (!vscode.env.shell || !vscode.workspace.isTrusted) {
        throw new Error('Shell command is not supported in your current workspace.')
    }

    // Get workspace directory
    const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.path

    // Filter and sanitize command
    const filteredCommand = node.data.command?.replaceAll(/(\s~\/)/g, ` ${homeDir}${path.sep}`) || ''

    // Check for disallowed commands (you'll need to define commandsNotAllowed array)
    if (commandsNotAllowed.some(cmd => filteredCommand.startsWith(cmd))) {
        void vscode.window.showErrorMessage('Cody cannot execute this command')
        throw new Error('Cody cannot execute this command')
    }

    try {
        const { stdout, stderr } = await execAsync(filteredCommand, { cwd })

        if (stderr) {
            throw new Error(stderr)
        }
        return stdout.replace(/\n$/, '')
    } catch (error) {
        throw new Error(
            `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

async function executeLLMNode(node: WorkflowNode, chatClient: ChatClient): Promise<string> {
    if (!node.data.prompt) {
        throw new Error(`No prompt specified for LLM node ${node.id} with ${node.data.label}`)
    }

    try {
        // Convert to messages format expected by chat client
        const messages: Message[] = [
            {
                speaker: 'human',
                text: PromptString.unsafe_fromUserQuery(node.data.prompt),
            },
        ]

        // Using the chat client directly as seen in chat.ts
        const response = await new Promise<string>((resolve, reject) => {
            let fullResponse = ''

            // Stream the response and accumulate it
            chatClient
                .chat(messages, {
                    stream: false,
                    maxTokensToSample: 1000, // Adjust as needed
                    model: 'anthropic::2024-10-22::claude-3-5-sonnet-latest',
                })
                .then(async stream => {
                    try {
                        for await (const message of stream) {
                            switch (message.type) {
                                case 'change':
                                    fullResponse += message.text
                                    break
                                case 'complete':
                                    resolve(fullResponse)
                                    break
                                case 'error':
                                    reject(message.error)
                                    break
                            }
                        }
                    } catch (error) {
                        reject(error)
                    }
                })
                .catch(reject)
        })

        return response
    } catch (error) {
        throw new Error(
            `Failed to execute LLM node: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

async function executePreviewNode(input: string): Promise<string> {
    return input
}

async function executeInputNode(input: string): Promise<string> {
    // Return the content directly as it's user input
    return input
}

function combineParentOutputsByConnectionOrder(
    nodeId: string,
    edges: Edge[],
    context: ExecutionContext,
    nodeType: string
): string {
    const parentEdges = edges.filter(edge => edge.target === nodeId)
    const inputs = parentEdges
        .map(edge => {
            const output = context.nodeOutputs.get(edge.source)
            if (output === undefined) {
                return ''
            }
            // Apply appropriate sanitization based on target node type
            if (nodeType === 'cli') {
                return sanitizeForShell(output)
            }
            if (nodeType === 'llm') {
                return sanitizeForPrompt(output)
            }
            return output
        })
        .filter(output => output !== undefined)
        .join('')

    return inputs
}

export async function executeWorkflow(
    nodes: WorkflowNode[],
    edges: Edge[],
    webview: vscode.Webview,
    chatClient: ChatClient
): Promise<void> {
    const context: ExecutionContext = {
        nodeOutputs: new Map(),
    }

    const sortedNodes = topologicalSort(nodes, edges)

    webview.postMessage({
        type: 'execution_started',
    } as WorkflowFromExtension)

    for (const node of sortedNodes) {
        try {
            const combinedInput = combineParentOutputsByConnectionOrder(
                node.id,
                edges,
                context,
                node.type
            )

            webview.postMessage({
                type: 'node_execution_status',
                data: { nodeId: node.id, status: 'running' },
            } as WorkflowFromExtension)

            let result: string
            switch (node.type) {
                case 'cli': {
                    const command =
                        node.data.command?.replace('${input}', sanitizeForShell(combinedInput)) || ''
                    result = await executeCLINode({ ...node, data: { ...node.data, command } })
                    break
                }
                case 'llm': {
                    const prompt =
                        node.data.prompt?.replace('${input}', sanitizeForPrompt(combinedInput)) || ''
                    result = await executeLLMNode(
                        { ...node, data: { ...node.data, prompt } },
                        chatClient
                    )
                    break
                }
                case 'preview': {
                    result = await executePreviewNode(combinedInput)
                    break
                }
                case 'input': {
                    const text =
                        node.data.content?.replace('${input}', sanitizeForPrompt(combinedInput)) || ''
                    result = await executeInputNode(text)
                    break
                }
                default:
                    throw new Error(`Unknown node type: ${node.type}`)
            }

            context.nodeOutputs.set(node.id, result)
            webview.postMessage({
                type: 'node_execution_status',
                data: { nodeId: node.id, status: 'completed', result },
            } as WorkflowFromExtension)
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            webview.postMessage({
                type: 'node_execution_status',
                data: { nodeId: node.id, status: 'error', result: errorMessage },
            } as WorkflowFromExtension)
            // Send execution completed message to indicate workflow has stopped
            webview.postMessage({
                type: 'execution_completed',
            } as WorkflowFromExtension)
            void vscode.window.showErrorMessage(errorMessage)
            // Exit the function to stop execution
            return
        }
    }

    webview.postMessage({
        type: 'execution_completed',
    } as WorkflowFromExtension)
}

function sanitizeForShell(input: string): string {
    return input.replace(/(["\\'$`])/g, '\\$1').replace(/\n/g, ' ')
}

function sanitizeForPrompt(input: string): string {
    return input.replace(/\${/g, '\\${')
}

const commandsNotAllowed = [
    'rm',
    'chmod',
    'shutdown',
    'history',
    'user',
    'sudo',
    'su',
    'passwd',
    'chown',
    'chgrp',
    'kill',
    'reboot',
    'poweroff',
    'init',
    'systemctl',
    'journalctl',
    'dmesg',
    'lsblk',
    'lsmod',
    'modprobe',
    'insmod',
    'rmmod',
    'lsusb',
    'lspci',
]
