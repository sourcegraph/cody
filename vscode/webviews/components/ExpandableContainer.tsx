import clsx from 'clsx'
import { ChevronsUpDownIcon } from 'lucide-react'
import React from 'react'
import { Button } from './shadcn/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './shadcn/ui/collapsible'

interface ExpandableContainerProps {
    title: string
    items: React.ReactNode
    className?: string
    closeByDefault?: boolean
}

const ExpandableContainer: React.FC<ExpandableContainerProps> = ({
    title,
    items,
    className,
    closeByDefault,
}) => {
    const [isOpen, setIsOpen] = React.useState(!closeByDefault)

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className={clsx('tw-w-full tw-flex tw-flex-col tw-gap-3', className)}
        >
            <div className="tw-flex tw-justify-between">
                <h4 className="tw-text">{title}</h4>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <ChevronsUpDownIcon
                            className="tw-h-8 tw-w-8 tw-text"
                            size={16}
                            strokeWidth="1.25"
                        />
                    </Button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="tw-overflow-hidden tw-transition-all data-[state=closed]:tw-animate-collapsible-up data-[state=open]:tw-animate-collapsible-down">
                <div className="tw-px-2 tw-py-2 tw-flex tw-flex-col tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                    {items}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export { ExpandableContainer }
