import { Handle, Position } from '@xyflow/react'
import type React from 'react'
import { v4 as uuidv4 } from 'uuid'

// Core type definitions
export enum NodeType {
    CLI = 'cli',
    LLM = 'llm',
    PREVIEW = 'preview',
    INPUT = 'input',
}

// Shared node props interface
interface BaseNodeProps {
    data: {
        label: string
        moving?: boolean
        executing?: boolean
        error?: boolean
        content?: string
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
        input?: string
        output?: string
        content?: string
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
    position: { x: number; y: number }
): WorkflowNode => ({
    id: uuidv4(),
    type,
    data: {
        label,
        command: type === NodeType.CLI ? '' : undefined,
        prompt: type === NodeType.LLM ? '' : undefined,
        content: type === NodeType.PREVIEW ? '' : undefined,
    },
    position,
})

// Default workflow template
export const defaultWorkflow = {
    nodes: [
        createNode(NodeType.CLI, 'Git Diff', { x: 0, y: 0 }),
        createNode(NodeType.LLM, 'Cody Generate Commit Message', { x: 0, y: 100 }),
        createNode(NodeType.CLI, 'Git Commit', { x: 0, y: 200 }),
    ],
    edges: [
        { id: 'xy-edge__1-2', source: '1', target: '2' },
        { id: 'xy-edge__2-3', source: '2', target: '3' },
    ],
}
// Shared node styling with type-specific colors
const getNodeStyle = (
    type: NodeType,
    moving?: boolean,
    selected?: boolean,
    executing?: boolean,
    error?: boolean
) => ({
    padding: '0.5rem',
    borderRadius: '0.25rem',
    backgroundColor: error
        ? 'var(--vscode-inputValidation-errorBackground)'
        : 'var(--vscode-dropdown-background)',
    color: 'var(--vscode-dropdown-foreground)',
    border: `2px solid ${
        error
            ? 'var(--vscode-inputValidation-errorBorder)'
            : executing
              ? 'var(--vscode-charts-yellow)'
              : moving
                ? 'var(--vscode-focusBorder)'
                : selected
                  ? 'var(--vscode-testing-iconPassed)'
                  : type === NodeType.CLI
                    ? 'var(--vscode-textLink-foreground)'
                    : 'var(--vscode-foreground)'
    }`,
})

export const PreviewNode: React.FC<BaseNodeProps> = ({ data, selected }) => (
    <div style={getNodeStyle(NodeType.PREVIEW, data.moving, selected, data.executing, data.error)}>
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-flex-col tw-gap-2">
            <span>{data.label}</span>
            <textarea
                className="tw-w-full tw-h-24 tw-p-2 tw-rounded nodrag tw-resize tw-border-2 tw-border-solid tw-border-[var(--xy-node-border-default)]"
                style={{
                    color: 'var(--vscode-editor-foreground)',
                    backgroundColor: 'var(--vscode-input-background)',
                    outline: 'none',
                }}
                value={data.content || ''}
                readOnly
                placeholder="Preview content will appear here..."
            />
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)

export const InputNode: React.FC<BaseNodeProps> = ({ data, selected }) => (
    <div style={getNodeStyle(NodeType.INPUT, data.moving, selected, data.executing, data.error)}>
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-flex-col tw-gap-2 tw-text-left">
            <span>{data.label}</span>
            <textarea
                className="tw-w-full tw-h-24 tw-p-2 tw-rounded nodrag tw-resize tw-border-2 tw-border-solid tw-border-[var(--xy-node-border-default)]"
                style={{
                    color: 'var(--vscode-editor-foreground)',
                    backgroundColor: 'var(--vscode-input-background)',
                    outline: 'none', // Add this line
                }}
                value={data.content || ''}
                readOnly
                placeholder="Enter your input text here..."
            />
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)

// Node Components with shared base props
export const CLINode: React.FC<BaseNodeProps> = ({ data, selected }) => (
    <div style={getNodeStyle(NodeType.CLI, data.moving, selected, data.executing, data.error)}>
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-items-center">
            <span>{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)

export const CodyLLMNode: React.FC<BaseNodeProps> = ({ data, selected }) => (
    <div style={getNodeStyle(NodeType.LLM, data.moving, selected, data.executing, data.error)}>
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
    [NodeType.PREVIEW]: PreviewNode,
    [NodeType.INPUT]: InputNode,
}
