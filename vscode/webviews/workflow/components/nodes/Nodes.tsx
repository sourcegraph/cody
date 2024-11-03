import { Handle, Position } from '@xyflow/react'
import type React from 'react'

export enum NodeType {
    CLI = 'cli',
    LLM = 'llm',
}

export interface WorkflowNode {
    id: string
    type: NodeType
    data: {
        label: string
        command?: string // For CLI nodes
        prompt?: string // For LLM nodes
    }
    position: {
        x: number
        y: number
    }
}

export const CLINode: React.FC<{ data: { label: string } }> = ({ data }) => (
    <div
        style={{
            padding: '0.5rem',
            borderRadius: '0.25rem',
            backgroundColor: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            border: '1px solid var(--vscode-textLink-foreground)',
        }}
    >
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-items-center">
            <span>{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)

export const CodyLLMNode: React.FC<{ data: { label: string } }> = ({ data }) => (
    <div
        style={{
            padding: '0.5rem',
            borderRadius: '0.25rem',
            backgroundColor: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            border: '1px solid var(--vscode-foreground)',
        }}
    >
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-items-center">
            <span>{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)
