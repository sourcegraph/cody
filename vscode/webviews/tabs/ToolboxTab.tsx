import type { FC } from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../components/shadcn/ui/accordion'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import type { View } from './types'

interface ToolboxTabProps {
    setView: (view: View) => void
}

interface ToolboxItem {
    id: string
    title: string
    description: string
    icon?: string
}

const toolboxItems: ToolboxItem[] = [
    {
        id: 'workflow-tools',
        title: 'Workflow',
        description: 'Create workflows to streamline processes',
    },
    {
        id: 'token-tools',
        title: 'Tokens',
        description: 'Show informative token usage',
    },
    {
        id: 'cli-tools',
        title: 'CLI Tools',
        description: 'Execute and manage command-line operations',
    },
]

const ToolboxTab: FC<ToolboxTabProps> = ({ setView }) => {
    // Move API access inside component
    return (
        <div className="tw-p-4 tw-h-full tw-overflow-auto">
            <div className="tw-mb-6">
                <h2 className="tw-text-xl tw-font-semibold tw-text-center">Cody Toolbox</h2>
            </div>

            <Accordion type="single" collapsible>
                {toolboxItems.map(item => (
                    <AccordionItem key={item.id} value={item.id}>
                        <AccordionTrigger className="tw-text-base">{item.title}</AccordionTrigger>
                        <AccordionContent>
                            <div className="tw-p-2">
                                <p className="tw-text-sm tw-text-muted-foreground tw-mb-4">
                                    {item.description}
                                </p>
                                {/* Tool-specific content can be added here */}
                                <div className="tw-space-y-2">
                                    {item.id === 'workflow-tools' && (
                                        <div className="tw-inline-flex tw-items-center tw-p-2 tw-rounded-md tw-border">
                                            <button
                                                type="button"
                                                className="tw-px-3 tw-py-1 tw-bg-button-background tw-text-button-foreground tw-rounded hover:tw-bg-button-hoverBackground"
                                                onClick={() => {
                                                    getVSCodeAPI().postMessage({
                                                        command: 'command',
                                                        id: 'cody.openWorkflowEditor',
                                                    })
                                                }}
                                            >
                                                Workflow Editor
                                            </button>
                                        </div>
                                    )}
                                    {item.id === 'token-tools' && (
                                        <div className="tw-p-2 tw-rounded-md tw-border">
                                            <h3 className="tw-font-medium">Token Usage</h3>
                                            <p className="tw-text-sm">Retrieve the used tokens</p>
                                        </div>
                                    )}
                                    {item.id === 'cli-tools' && (
                                        <div className="tw-p-2 tw-rounded-md tw-border">
                                            <h3 className="tw-font-medium">CLI Operations</h3>
                                            <p className="tw-text-sm">
                                                Execute commands and view outputs
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}{' '}
            </Accordion>
        </div>
    )
}

export default ToolboxTab
