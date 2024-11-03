import type React from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../components/shadcn/ui/accordion'
import { Button } from '../../components/shadcn/ui/button'
import { NodeType } from './nodes/Nodes'

interface WorkflowSidebarProps {
    onNodeAdd: (nodeLabel: string, nodeType: NodeType) => void
}

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({ onNodeAdd }) => {
    return (
        <div className="tw-w-64 tw-border-r tw-border-border tw-h-full tw-bg-sidebar-background tw-p-4">
            <Accordion type="single" collapsible>
                <AccordionItem value="cli">
                    <AccordionTrigger>CLI Actions</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <div className="tw-border">
                                <Button
                                    onClick={() => onNodeAdd('Git Diff', NodeType.CLI)}
                                    className="tw-w-full tw-justify-start"
                                    variant="ghost"
                                >
                                    Git Diff
                                </Button>
                            </div>
                            <div className="tw-border">
                                <Button
                                    onClick={() => onNodeAdd('Git Commit', NodeType.CLI)}
                                    className="tw-w-full tw-justify-start"
                                    variant="ghost"
                                >
                                    Git Commit
                                </Button>
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="llm">
                    <AccordionTrigger>Cody LLM Actions</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <div className="tw-border">
                                <Button
                                    onClick={() => onNodeAdd('Cody Generate Commit', NodeType.LLM)}
                                    className="tw-w-full tw-justify-start"
                                    variant="ghost"
                                >
                                    Cody Inference
                                </Button>
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    )
}
