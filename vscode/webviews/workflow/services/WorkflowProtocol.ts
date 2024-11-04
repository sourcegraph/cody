import type { Edge, WorkflowNode } from '../components/nodes/Nodes'

export type WorkflowToExtension = {
    type: 'save_workflow' | 'load_workflow'
    data?: {
        nodes: WorkflowNode[] | undefined
        edges: Edge[] | undefined
    }
}

export type WorkflowFromExtension = {
    type: 'hello_webview' | 'workflow_loaded'
    data?: {
        nodes: WorkflowNode[]
        edges: Edge[]
    }
}
