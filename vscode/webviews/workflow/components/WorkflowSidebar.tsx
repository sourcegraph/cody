import type React from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../components/shadcn/ui/accordion'
import { Button } from '../../components/shadcn/ui/button'

interface WorkflowSidebarProps {
    onNodeAdd: (nodeType: string) => void
}

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({ onNodeAdd }) => {
    return (
        <div className="tw-w-64 tw-border-r tw-border-border tw-h-full tw-bg-sidebar-background tw-p-4">
            <Accordion type="single" collapsible>
                <AccordionItem value="actions">
                    <AccordionTrigger>Actions</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <Button
                                onClick={() => onNodeAdd('gitDiff')}
                                className="tw-w-full tw-justify-start"
                                variant="ghost"
                            >
                                Git Diff
                            </Button>
                            <Button
                                onClick={() => onNodeAdd('codyCommit')}
                                className="tw-w-full tw-justify-start"
                                variant="ghost"
                            >
                                Cody Generate Commit
                            </Button>
                            <Button
                                onClick={() => onNodeAdd('gitCommit')}
                                className="tw-w-full tw-justify-start"
                                variant="ghost"
                            >
                                Git Commit
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="templates">
                    <AccordionTrigger>Templates</AccordionTrigger>
                    <AccordionContent>
                        <div className="tw-flex tw-flex-col tw-gap-2">
                            <Button
                                onClick={() => onNodeAdd('commitTemplate')}
                                className="tw-w-full tw-justify-start"
                                variant="ghost"
                            >
                                Commit Workflow
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    )
}
