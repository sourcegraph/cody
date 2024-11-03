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

const initialNodes = [
    {
        id: '1',
        data: { label: 'Git Diff' },
        position: { x: 0, y: 0 },
        type: 'input',
    },
    {
        id: '2',
        data: { label: 'Cody Generate Commit Message' },
        position: { x: 0, y: 100 },
    },
    {
        id: '3',
        data: { label: 'Git Commit' },
        position: { x: 0, y: 200 },
    },
]

const initialEdges = [
    { id: '1-2', source: '1', target: '2', type: 'step' },
    { id: '2-3', source: '2', target: '3', type: 'step' },
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
        (nodeType: string) => {
            const { x, y, zoom } = getViewport()
            const position = { x: -x + 100 * zoom, y: -y + 100 * zoom }

            const newNode = {
                id: `${nodes.length + 1}`,
                data: { label: nodeType },
                position,
                type: nodes.length === 0 ? 'input' : undefined,
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
