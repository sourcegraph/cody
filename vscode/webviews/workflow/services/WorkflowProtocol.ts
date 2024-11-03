import type { Edge, WorkflowNode } from '../components/nodes/Nodes'

export type WorkflowToExtension = {
    type: 'save_workflow'
    data: {
        nodes: WorkflowNode[] | undefined
        edges: Edge[] | undefined
    }
}

export type WorkflowFromExtension = {
    type: 'hello_webview'
}
