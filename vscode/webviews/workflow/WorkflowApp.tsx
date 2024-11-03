import {
    Background,
    Controls,
    type EdgeChange,
    type NodeChange,
    ReactFlow,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
} from '@xyflow/react'
import React, { useState, useCallback } from 'react'
import '@xyflow/react/dist/style.css'

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

export interface WorkflowAppProps {
    count?: number
}

export const WorkflowApp: React.FunctionComponent<WorkflowAppProps> = () => {
    const [nodes, setNodes] = useState(initialNodes)
    const [edges, setEdges] = useState(initialEdges)

    const onNodesChange = useCallback(
        (
            changes: NodeChange<
                | {
                      id: string
                      data: { label: string }
                      position: { x: number; y: number }
                      type: string
                  }
                | {
                      id: string
                      data: { label: string }
                      position: { x: number; y: number }
                      type?: undefined
                  }
            >[]
        ) => setNodes(nds => applyNodeChanges(changes, nds) as typeof initialNodes),
        []
    )

    const onEdgesChange = useCallback(
        (changes: EdgeChange<{ id: string; source: string; target: string; type: string }>[]) =>
            setEdges(eds => applyEdgeChanges(changes, eds)),
        []
    )

    const onConnect = useCallback((params: any) => setEdges(eds => addEdge(params, eds)), [])

    return (
        <div style={{ width: '100%', height: '100vh' }}>
            <ReactFlow
                colorMode="light"
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
    )
}
