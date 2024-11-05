import type React from 'react'
import { Input } from '../../components/shadcn/ui/input'
import { Label } from '../../components/shadcn/ui/label'
import { Textarea } from '../../components/shadcn/ui/textarea'
import { NodeType, type WorkflowNode } from './nodes/Nodes'

interface PropertyEditorProps {
    node: WorkflowNode
    onUpdate: (nodeId: string, data: Partial<WorkflowNode['data']>) => void
}

export const PropertyEditor: React.FC<PropertyEditorProps> = ({ node, onUpdate }) => {
    return (
        <div className="tw-flex tw-flex-col tw-gap-4">
            <div>
                <Label htmlFor="node-label">Node ID: {node.id}</Label>
            </div>
            <div>
                <Label htmlFor="node-label">Label</Label>
                <Input
                    id="node-label"
                    value={node.data.label}
                    onChange={(e: { target: { value: any } }) =>
                        onUpdate(node.id, { label: e.target.value })
                    }
                />
            </div>

            {node.type === NodeType.CLI && (
                <div>
                    <Label htmlFor="node-command">Command</Label>
                    <Input
                        id="node-command"
                        value={node.data.command || ''}
                        onChange={(e: { target: { value: any } }) =>
                            onUpdate(node.id, { command: e.target.value })
                        }
                        placeholder="Enter CLI command..."
                    />
                </div>
            )}

            {node.type === NodeType.LLM && (
                <div>
                    <Label htmlFor="node-prompt">Prompt</Label>
                    <Textarea
                        id="node-prompt"
                        value={node.data.prompt || ''}
                        onChange={(e: { target: { value: any } }) =>
                            onUpdate(node.id, { prompt: e.target.value })
                        }
                        placeholder="Enter LLM prompt..."
                    />
                </div>
            )}

            {node.type === NodeType.INPUT && (
                <div>
                    <Label htmlFor="node-input">Input Text</Label>
                    <Textarea
                        id="node-input"
                        value={node.data.content || ''}
                        onChange={(e: { target: { value: any } }) =>
                            onUpdate(node.id, { content: e.target.value })
                        }
                        placeholder="Enter input text..."
                    />
                </div>
            )}
        </div>
    )
}
