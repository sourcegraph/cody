import {
    CollapsibleContent,
    CollapsibleTrigger,
    Collapsible as _Collapsible,
} from '@radix-ui/react-collapsible'
import clsx from 'clsx'
import { ChevronsUpDownIcon } from 'lucide-react'
import React from 'react'
import { Button } from './button'

interface CollapsibleProps {
    title: string
    items: React.ReactNode
    className?: string
    closeByDefault?: boolean
}

const Collapsible: React.FC<CollapsibleProps> = ({ title, items, className, closeByDefault }) => {
    const [isOpen, setIsOpen] = React.useState(!closeByDefault)

    return (
        <_Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className={clsx('tw-w-full tw-flex tw-flex-col tw-gap-2 tw-self-stretch', className)}
        >
            <CollapsibleTitle title={title} />
            <CollapsibleMenu content={items} />
        </_Collapsible>
    )
}

const CollapsibleMenu: React.FC<{ content: React.ReactNode }> = ({ content }) => {
    return (
        <CollapsibleContent className="tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg tw-items-baseline">
            {content}
        </CollapsibleContent>
    )
}

const CollapsibleTitle: React.FC<{ title: string }> = ({ title }) => {
    return (
        <div className="tw-flex tw-justify-between tw-py-3 tw-text-foreground">
            <h4 className="tw-text">{title}</h4>
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="tw-w-9 tw-p-0 tw-text">
                    <ChevronsUpDownIcon className="tw-h-4 tw-w-4 tw-text" size={16} />
                </Button>
            </CollapsibleTrigger>
        </div>
    )
}

export { Collapsible, CollapsibleMenu, CollapsibleTitle }
