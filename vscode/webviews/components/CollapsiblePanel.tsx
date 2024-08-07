import clsx from 'clsx'
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from './shadcn/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './shadcn/ui/collapsible'

interface CollapsiblePanelProps {
    storageKey: string
    title: string
    children: React.ReactNode
    className?: string
    contentClassName?: string
    initialOpen?: boolean
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
    storageKey,
    title,
    children,
    className,
    contentClassName,
    initialOpen,
}) => {
    const [isOpen, setIsOpen] = useCollapsiblePanelOpenState(storageKey, initialOpen)

    const Icon = isOpen ? ChevronsDownUpIcon : ChevronsUpDownIcon

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className={clsx('tw-w-full tw-flex tw-flex-col tw-gap-3', className)}
        >
            <div className="tw-flex tw-justify-between">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" data-testid="collapsible-trigger">
                        <h4 className="tw-text tw-font-medium tw-text-muted-foreground">{title}</h4>
                        <Icon
                            className="tw-h-8 tw-w-8 tw-text-muted-foreground"
                            size={16}
                            strokeWidth="1.25"
                        />
                    </Button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
                <div
                    className={clsx(
                        'tw-px-2 tw-py-2 tw-flex tw-flex-col tw-bg-popover tw-border tw-border-border tw-rounded-lg',
                        contentClassName
                    )}
                >
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

function useCollapsiblePanelOpenState(
    storageKey: string,
    initialOpen = false
): [boolean, (isOpen: boolean) => void] {
    const fullStorageKey = `cody.collapsiblePanel.${storageKey}`
    const value = localStorage.getItem(fullStorageKey)
    const storedValue = value === null ? initialOpen : value === 'true'
    const [isOpen, setIsOpen] = useState(storedValue ?? initialOpen)
    return [
        isOpen,
        (isOpen: boolean) => {
            setIsOpen(isOpen)
            if (isOpen === initialOpen) {
                localStorage.removeItem(fullStorageKey)
            } else {
                localStorage.setItem(fullStorageKey, isOpen ? 'true' : 'false')
            }
        },
    ]
}
