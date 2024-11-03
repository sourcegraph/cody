import { Handle, Position } from '@xyflow/react'
import type React from 'react'

// Core type definitions
export enum NodeType {
    CLI = 'cli',
    LLM = 'llm',
}

// Shared node props interface
interface BaseNodeProps {
    data: {
        label: string
        moving?: boolean
    }
    selected?: boolean
}

export interface WorkflowNode {
    id: string
    type: NodeType
    data: {
        label: string
        command?: string
        prompt?: string
    }
    position: {
        x: number
        y: number
    }
}

// Node Factory
export const createNode = (
    type: NodeType,
    label: string,
    position: { x: number; y: number },
    nodeCount: number
): WorkflowNode => ({
    id: String(nodeCount + 1),
    type,
    data: {
        label,
        command: type === NodeType.CLI ? '' : undefined,
        prompt: type === NodeType.LLM ? '' : undefined,
    },
    position,
})

// Default workflow template
export const defaultWorkflow = {
    nodes: [
        createNode(NodeType.CLI, 'Git Diff', { x: 0, y: 0 }, 0),
        createNode(NodeType.LLM, 'Cody Generate Commit Message', { x: 0, y: 100 }, 1),
        createNode(NodeType.CLI, 'Git Commit', { x: 0, y: 200 }, 2),
    ],
    edges: [
        { id: '1-2', source: '1', target: '2', type: 'bezier' },
        { id: '2-3', source: '2', target: '3', type: 'bezier' },
    ],
}

// Shared node styling with type-specific colors
const getNodeStyle = (type: NodeType, moving?: boolean, selected?: boolean) => ({
    padding: '0.5rem',
    borderRadius: '0.25rem',
    backgroundColor: 'var(--vscode-dropdown-background)',
    color: 'var(--vscode-dropdown-foreground)',
    border: `2px solid ${
        moving
            ? 'var(--vscode-focusBorder)'
            : selected
              ? 'var(--vscode-testing-iconPassed)'
              : type === NodeType.CLI
                ? 'var(--vscode-textLink-foreground)'
                : 'var(--vscode-foreground)'
    }`,
})

// Node Components with shared base props
export const CLINode: React.FC<BaseNodeProps> = ({ data, selected }) => (
    <div style={getNodeStyle(NodeType.CLI, data.moving, selected)}>
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-items-center">
            <span>{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)

export const CodyLLMNode: React.FC<BaseNodeProps> = ({ data, selected }) => (
    <div style={getNodeStyle(NodeType.LLM, data.moving, selected)}>
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-items-center">
            <span>{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)

export const nodeTypes = {
    [NodeType.CLI]: CLINode,
    [NodeType.LLM]: CodyLLMNode,
}
