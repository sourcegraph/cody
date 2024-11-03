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
    const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
    const [movingNodeId, setMovingNodeId] = useState<string | null>(null)

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            // Track node movement
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

            const updatedNodes = applyNodeChanges(changes, nodes) as typeof initialNodes
            setNodes(updatedNodes)

            if (selectedNode) {
                const updatedSelectedNode = updatedNodes.find(node => node.id === selectedNode.id)
                setSelectedNode(updatedSelectedNode || null)
            }
        },
        [selectedNode, nodes, movingNodeId]
    )

    // Update the nodes to include moving state
    // Update the nodesWithState mapping
    const nodesWithState = nodes.map(node => ({
        ...node,
        selected: node.id === selectedNode?.id,
        data: {
            ...node.data,
            moving: node.id === movingNodeId, // Move moving state into data
        },
    }))

    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) =>
            setEdges(eds => applyEdgeChanges(changes, eds) as typeof initialEdges),
        []
    )

    const onConnect = useCallback((params: any) => setEdges(eds => addEdge(params, eds)), [])

    const onNodeClick = useCallback((event: React.MouseEvent, node: WorkflowNode) => {
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
        [getViewport, nodes]
    )

    return (
        <div className="tw-flex tw-h-screen">
            <WorkflowSidebar
                onNodeAdd={handleAddNode}
                selectedNode={selectedNode}
                onNodeUpdate={onNodeUpdate}
            />
            <div className="tw-flex-1">
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
