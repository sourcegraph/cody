import { exec } from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

import type { Edge, WorkflowNode } from '../../webviews/workflow/components/nodes/Nodes'
import type { WorkflowFromExtension } from '../../webviews/workflow/services/WorkflowProtocol'

interface ExecutionContext {
    nodeOutputs: Map<string, string>
}

const execAsync = promisify(exec)

function topologicalSort(nodes: WorkflowNode[], edges: Edge[]): WorkflowNode[] {
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
    if (!node.data.command) {
        await vscode.window.showErrorMessage(
            `Failed to execute CLI node: No command specified for node ${node.id} with ${node.data.label}`
        )
        throw new Error(`No command specified for CLI node ${node.id}  with ${node.data.label}`)
    }

    // Check if shell is available and workspace is trusted
    if (!vscode.env.shell || !vscode.workspace.isTrusted) {
        throw new Error('Shell command is not supported in your current workspace.')
    }

    // Get workspace directory
    const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.path

    // Filter and sanitize command
    const filteredCommand = node.data.command.replaceAll(/(\s~\/)/g, ` ${homeDir}${path.sep}`)

    // Check for disallowed commands (you'll need to define commandsNotAllowed array)
    if (commandsNotAllowed.some(cmd => filteredCommand.startsWith(cmd))) {
        void vscode.window.showErrorMessage('Cody cannot execute this command')
        throw new Error('Cody cannot execute this command')
    }

    try {
        console.log('execute CLI: ', JSON.stringify(node.data.command, null, 2))
        await new Promise(resolve => setTimeout(resolve, 2000))
        const { stdout, stderr } = await execAsync(filteredCommand, { cwd })
        console.log('executed CLI: ', JSON.stringify(stdout, null, 2))

        if (stderr) {
            throw new Error(stderr)
        }
        return stdout
    } catch (error) {
        throw new Error(
            `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}
async function executeLLMNode(node: WorkflowNode): Promise<string> {
    // Implement LLM execution logic here
    // This would integrate with your existing Cody API
    // TODO(PriNova): Implement LLM inference logic
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log('execute LLM: ', JSON.stringify(node, null, 2))
    return `LLM result for ${node.data.prompt || 'no prompt'}`
}

// Add new helper function that maintains edge order as connected
function combineParentOutputsByConnectionOrder(
    nodeId: string,
    edges: Edge[],
    context: ExecutionContext
): string {
    // Use edges array order directly (maintains order of connections)
    const parentEdges = edges.filter(edge => edge.target === nodeId)

    const inputs = parentEdges.map(edge => context.nodeOutputs.get(edge.source)).filter(Boolean)

    return inputs.join('\n')
}

// Modify the executeWorkflow function
export async function executeWorkflow(
    nodes: WorkflowNode[],
    edges: Edge[],
    webview: vscode.Webview
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
            // Use connection order for input combination
            const combinedInput = combineParentOutputsByConnectionOrder(node.id, edges, context)

            webview.postMessage({
                type: 'node_execution_status',
                data: { nodeId: node.id, status: 'running' },
            } as WorkflowFromExtension)

            let result: string
            switch (node.type) {
                case 'cli': {
                    const command = node.data.command?.replace('${input}', combinedInput) || ''
                    result = await executeCLINode({ ...node, data: { ...node.data, command } })
                    break
                }
                case 'llm': {
                    const prompt = node.data.prompt?.replace('${input}', combinedInput) || ''
                    result = await executeLLMNode({ ...node, data: { ...node.data, prompt } })
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
            return
        }
    }

    webview.postMessage({
        type: 'execution_completed',
    } as WorkflowFromExtension)
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
