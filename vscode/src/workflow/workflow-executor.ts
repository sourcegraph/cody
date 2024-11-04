//import { exec } from 'node:child_process'
//import { promisify } from 'node:util'
import * as vscode from 'vscode'
import type { Edge, WorkflowNode } from '../../webviews/workflow/components/nodes/Nodes'
import type { WorkflowFromExtension } from '../../webviews/workflow/services/WorkflowProtocol'

//const execAsync = promisify(exec)

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

    // Find nodes with no dependencies
    const queue = nodes.filter(node => inDegree.get(node.id) === 0).map(node => node.id)
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
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('execute CLI: ', JSON.stringify(node, null, 2))
    // TODO(PriNova): Implement safe execution logic
    /* const { stdout, stderr } = await execAsync(node.data.command)
    if (stderr) {
        throw new Error(stderr)
    } */
    return node.data.command
}

async function executeLLMNode(node: WorkflowNode): Promise<string> {
    // Implement LLM execution logic here
    // This would integrate with your existing Cody API
    // TODO(PriNova): Implement LLM inference logic
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log('execute LLM: ', JSON.stringify(node, null, 2))
    return `LLM result for ${node.data.prompt || 'no prompt'}`
}

export async function executeWorkflow(
    nodes: WorkflowNode[],
    edges: Edge[],
    webview: vscode.Webview
): Promise<void> {
    const sortedNodes = topologicalSort(nodes, edges)

    webview.postMessage({
        type: 'execution_started',
    } as WorkflowFromExtension)

    for (const node of sortedNodes) {
        try {
            webview.postMessage({
                type: 'node_execution_status',
                data: { nodeId: node.id, status: 'running' },
            } as WorkflowFromExtension)

            let result: string
            switch (node.type) {
                case 'cli':
                    result = await executeCLINode(node)
                    break
                case 'llm':
                    result = await executeLLMNode(node)
                    break
                default:
                    throw new Error(`Unknown node type: ${node.type}`)
            }

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
