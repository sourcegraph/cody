import type { Edge } from '../components/CustomOrderedEdge'
import type { WorkflowNode } from '../components/nodes/Nodes'
/**
 * Workflow extension communication protocol types.
 *
 * WorkflowToExtension: Messages sent from the webview to the VS Code extension
 * - save_workflow: Request to save current workflow
 * - load_workflow: Request to load a workflow
 * - execute_workflow: Request to execute current workflow
 *
 * WorkflowFromExtension: Messages sent from the VS Code extension to the webview
 * - workflow_loaded: Response after loading workflow
 * - execution_started: Workflow execution has started
 * - execution_completed: Workflow execution has completed
 * - node_execution_status: Status update for individual node execution
 */

export type WorkflowToExtension = {
    type: 'save_workflow' | 'load_workflow' | 'execute_workflow'
    data?: {
        nodes: WorkflowNode[] | undefined
        edges: Edge[] | undefined
    }
}

export type WorkflowFromExtension = {
    type: 'workflow_loaded' | 'execution_started' | 'execution_completed' | 'node_execution_status'
    data?: {
        nodes: WorkflowNode[]
        edges: Edge[]
        nodeId?: string
        status?: 'running' | 'completed' | 'error'
        result?: string
    }
}
