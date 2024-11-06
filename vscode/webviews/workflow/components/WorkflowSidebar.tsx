import type React from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../components/shadcn/ui/accordion'
import { Button } from '../../components/shadcn/ui/button'
import { PropertyEditor } from './PropertyEditor'
import { NodeType, type WorkflowNode } from './nodes/Nodes'

interface WorkflowSidebarProps {
    onNodeAdd: (nodeLabel: string, nodeType: NodeType) => void
    selectedNode?: WorkflowNode | null
    onNodeUpdate?: (nodeId: string, data: Partial<WorkflowNode['data']>) => void
    onSave?: () => void
    onLoad?: () => void
    onExecute?: () => void
    isExecuting?: boolean
}

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({
    onNodeAdd,
    selectedNode,
    onNodeUpdate,
    onSave,
    onLoad,
    onExecute,
    isExecuting,
}) => {
    const handleSave = async (): Promise<void> => {
        // Send message to VSCode extension to handle file saving
        if (onSave) {
            onSave()
        }
    }

    return (
        <div className="tw-w-full tw-border-r tw-border-border tw-h-full tw-bg-sidebar-background tw-p-4">
            <div className="tw-flex tw-flex-col tw-gap-2 tw-mb-4">
                <Button variant="secondary" className="tw-w-full" onClick={onLoad}>
                    Open Workflow
                </Button>
                <Button variant="secondary" className="tw-w-full" onClick={handleSave}>
                    Save Workflow
                </Button>
                <Button
                    variant="secondary"
                    className="tw-w-full"
                    onClick={() => {
                        if (onExecute) {
                            onExecute()
                        }
                    }}
                    disabled={isExecuting}
                >
                    {isExecuting ? 'Running...' : 'Execute'}
                </Button>
            </div>

            <div className="tw-my-4 tw-border-t tw-border-border" />
            <Accordion type="single" collapsible>
                <AccordionItem value="cli">
                    <AccordionTrigger>CLI Actions</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <Button
                                onClick={() => onNodeAdd('CLI Command', NodeType.CLI)}
                                className="tw-w-full"
                                variant="secondary"
                            >
                                CLI command
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="llm">
                    <AccordionTrigger>Cody LLM Actions</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <Button
                                onClick={() => onNodeAdd('Cody', NodeType.LLM)}
                                className="tw-w-full"
                                variant="secondary"
                            >
                                Cody
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="preview">
                    <AccordionTrigger>Preview</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <Button
                                onClick={() => onNodeAdd('Preview', NodeType.PREVIEW)}
                                className="tw-w-full"
                                variant="secondary"
                            >
                                Add Preview
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="input">
                    <AccordionTrigger>Input Text</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <Button
                                onClick={() => onNodeAdd('Text', NodeType.INPUT)}
                                className="tw-w-full"
                                variant="secondary"
                            >
                                Add Input Text
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>

            <div className="tw-my-4 tw-border-t tw-border-border" />

            <div className="tw-p-2">
                <h3 className="tw-text-sm tw-font-medium">Property Editor</h3>
                {selectedNode ? (
                    <PropertyEditor node={selectedNode} onUpdate={onNodeUpdate || (() => {})} />
                ) : (
                    <p className="tw-text-sm tw-text-muted-foreground tw-mt-2">
                        Select a node to edit its properties
                    </p>
                )}
            </div>
            <div className="tw-my-4 tw-border-t tw-border-border" />
        </div>
    )
}
