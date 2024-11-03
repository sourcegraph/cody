import {
    Background,
    Controls,
    type EdgeChange,
    type NodeChange,
    ReactFlow,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type React from 'react'
import { useCallback, useState } from 'react'
import type { VSCodeWrapper } from '../../utils/VSCodeApi'
import { WorkflowSidebar } from './WorkflowSidebar'
import { CLINode, CodyLLMNode, NodeType, type WorkflowNode } from './nodes/Nodes'

// Add nodeTypes to ReactFlow
const nodeTypes = {
    [NodeType.CLI]: CLINode,
    [NodeType.LLM]: CodyLLMNode,
}

const initialNodes: WorkflowNode[] = [
    {
        id: '1',
        type: NodeType.CLI,
        data: { label: 'Git Diff' },
        position: { x: 0, y: 0 },
    },
    {
        id: '2',
        type: NodeType.LLM,
        data: { label: 'Cody Generate Commit Message' },
        position: { x: 0, y: 100 },
    },
    {
        id: '3',
        type: NodeType.CLI,
        data: { label: 'Git Commit' },
        position: { x: 0, y: 200 },
    },
]

const initialEdges = [
    { id: '1-2', source: '1', target: '2', type: 'bezier' },
    { id: '2-3', source: '2', target: '3', type: 'bezier' },
]

export const Flow: React.FC<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const { getViewport } = useReactFlow()
    const [nodes, setNodes] = useState(initialNodes)
    const [edges, setEdges] = useState(initialEdges)

    const onNodesChange = useCallback(
        (changes: NodeChange[]) =>
            setNodes(nds => applyNodeChanges(changes, nds) as typeof initialNodes),
        []
    )

    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) =>
            setEdges(eds => applyEdgeChanges(changes, eds) as typeof initialEdges),
        []
    )

    const onConnect = useCallback((params: any) => setEdges(eds => addEdge(params, eds)), [])

    const handleAddNode = useCallback(
        (nodeLabel: string, nodeType: NodeType) => {
            const { x, y, zoom } = getViewport()
            const position = { x: -x + 100 * zoom, y: -y + 100 * zoom }

            const newNode: WorkflowNode = {
                id: `${nodes.length + 1}`,
                type: nodeType,
                data: {
                    label: nodeLabel,
                    command: nodeType === NodeType.CLI ? '' : undefined,
                    prompt: nodeType === NodeType.LLM ? '' : undefined,
                },
                position,
            }
            setNodes(nodes => [...nodes, newNode])
        },
        [nodes, getViewport]
    )

    return (
        <div className="tw-flex tw-h-screen">
            <WorkflowSidebar onNodeAdd={handleAddNode} />
            <div className="tw-flex-1">
                <div style={{ width: '100%', height: '100%' }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        nodeTypes={nodeTypes}
                        fitView
                    >
                        <Background />
                        <Controls />
                    </ReactFlow>
                </div>
            </div>
        </div>
    )
}
