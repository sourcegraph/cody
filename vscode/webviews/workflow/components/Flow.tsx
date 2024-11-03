import {
    Background,
    Controls,
    type EdgeChange,
    type NodeChange,
    ReactFlow,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    useOnSelectionChange,
    useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type React from 'react'
import { useCallback, useState } from 'react'
import type { VSCodeWrapper } from '../../utils/VSCodeApi'
import { WorkflowSidebar } from './WorkflowSidebar'
import { type NodeType, type WorkflowNode, createNode, defaultWorkflow, nodeTypes } from './nodes/Nodes'

export const Flow: React.FC<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const { getViewport } = useReactFlow()
    const [nodes, setNodes] = useState(defaultWorkflow.nodes)
    const [edges, setEdges] = useState(defaultWorkflow.edges)
    const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
    const [movingNodeId, setMovingNodeId] = useState<string | null>(null)

    // 1. Node Operations
    // Handles all node-related state changes and updates
    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            const dragChange = changes.find(
                change =>
                    change.type === 'position' &&
                    'dragging' in change &&
                    change.dragging &&
                    'id' in change
            ) as { id: string; type: 'position'; dragging: boolean } | undefined

            if (dragChange) {
                setMovingNodeId(dragChange.id)
            } else if (movingNodeId) {
                setMovingNodeId(null)
            }

            const updatedNodes = applyNodeChanges(changes, nodes) as typeof nodes
            setNodes(updatedNodes)

            if (selectedNode) {
                const updatedSelectedNode = updatedNodes.find(
                    (node: { id: string }) => node.id === selectedNode.id
                )
                setSelectedNode(updatedSelectedNode || null)
            }
        },
        [selectedNode, nodes, movingNodeId]
    )
    const onNodeClick = useCallback((event: React.MouseEvent, node: WorkflowNode) => {
        // Stop event propagation to prevent triggering background click
        event.stopPropagation()
        setSelectedNode(node)
    }, [])
    const onNodeUpdate = useCallback(
        (nodeId: string, data: Partial<WorkflowNode['data']>) => {
            setNodes(currentNodes =>
                currentNodes.map(node => {
                    if (node.id === nodeId) {
                        const updatedNode = {
                            ...node,
                            data: { ...node.data, ...data },
                        }
                        if (selectedNode?.id === nodeId) {
                            setSelectedNode(updatedNode)
                        }
                        return updatedNode
                    }
                    return node
                })
            )
        },
        [selectedNode]
    )
    const handleAddNode = useCallback(
        (nodeLabel: string, nodeType: NodeType) => {
            const { x, y, zoom } = getViewport()
            const position = { x: -x + 100 * zoom, y: -y + 100 * zoom }
            const newNode = createNode(nodeType, nodeLabel, position, nodes.length)
            setNodes(nodes => [...nodes, newNode])
        },
        [getViewport, nodes]
    )

    // 2. Edge Operations
    // Manages connections between nodes
    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) =>
            setEdges(eds => applyEdgeChanges(changes, eds) as typeof defaultWorkflow.edges),
        []
    )
    const onConnect = useCallback((params: any) => setEdges(eds => addEdge(params, eds)), [])

    // 3. Selection Management
    // Handles node selection state
    useOnSelectionChange({
        onChange: ({ nodes }) => {
            if (nodes.length === 0) {
                setSelectedNode(null)
            }
        },
    })

    // 4. Background/System Operations
    // Manages workspace interactions
    const handleBackgroundClick = useCallback((event: React.MouseEvent | React.KeyboardEvent) => {
        if (event.type === 'click' || (event as React.KeyboardEvent).key === 'Enter') {
            setSelectedNode(null)
        }
    }, [])
    const handleBackgroundKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            setSelectedNode(null)
        }
    }, [])

    // 5. State Transformations
    // Transforms data for rendering
    const nodesWithState = nodes.map(node => ({
        ...node,
        selected: node.id === selectedNode?.id,
        data: {
            ...node.data,
            moving: node.id === movingNodeId,
        },
    }))

    return (
        <div className="tw-flex tw-h-screen">
            <WorkflowSidebar
                onNodeAdd={handleAddNode}
                selectedNode={selectedNode}
                onNodeUpdate={onNodeUpdate}
            />
            <div
                className="tw-flex-1"
                onClick={handleBackgroundClick}
                onKeyDown={handleBackgroundKeyDown}
                role="button"
                tabIndex={0}
            >
                <div style={{ width: '100%', height: '100%' }}>
                    <ReactFlow
                        nodes={nodesWithState}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
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
