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

// Update CLINode component
export const CLINode: React.FC<{
    data: {
        label: string
        moving?: boolean
    }
    selected?: boolean
}> = ({ data, selected }) => (
    <div
        style={{
            padding: '0.5rem',
            borderRadius: '0.25rem',
            backgroundColor: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            border: `2px solid ${
                data.moving
                    ? 'var(--vscode-focusBorder)'
                    : selected
                      ? 'var(--vscode-testing-iconPassed)'
                      : 'var(--vscode-textLink-foreground)'
            }`,
        }}
    >
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-items-center">
            <span>{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)

// Update CodyLLMNode component
export const CodyLLMNode: React.FC<{
    data: {
        label: string
        moving?: boolean
    }
    selected?: boolean
}> = ({ data, selected }) => (
    <div
        style={{
            padding: '0.5rem',
            borderRadius: '0.25rem',
            backgroundColor: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            border: `2px solid ${
                data.moving
                    ? 'var(--vscode-focusBorder)'
                    : selected
                      ? 'var(--vscode-testing-iconPassed)'
                      : 'var(--vscode-foreground)'
            }`,
        }}
    >
        <Handle type="target" position={Position.Top} />
        <div className="tw-flex tw-items-center">
            <span>{data.label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
    </div>
)
