import clsx from 'clsx'
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import React from 'react'
import { Button } from './shadcn/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './shadcn/ui/collapsible'

interface CollapsiblePanelProps {
    title: string
    children: React.ReactNode
    className?: string
    closeByDefault?: boolean
}

const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
    title,
    children,
    className,
    closeByDefault,
}) => {
    const [isOpen, setIsOpen] = React.useState(!closeByDefault)

    const Icon = isOpen ? ChevronsDownUpIcon : ChevronsUpDownIcon

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className={clsx('tw-w-full tw-flex tw-flex-col tw-gap-3', className)}
        >
            <div className="tw-flex tw-justify-between">
                <h4 className="tw-text tw-font-medium tw-text-muted-foreground">{title}</h4>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <Icon className="tw-h-8 tw-w-8 tw-text" size={16} strokeWidth="1.25" />
                    </Button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
                <div className="tw-px-2 tw-py-2 tw-flex tw-flex-col tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export { CollapsiblePanel }
