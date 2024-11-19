import { ChevronDown, ChevronRight } from 'lucide-react'
import type * as React from 'react'
import { type KeyboardEventHandler, useCallback, useState } from 'react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { Button } from './shadcn/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './shadcn/ui/popover'

export const AccountSwitcher: React.FC<{ endpoints: string[] }> = ({ endpoints }) => {
    const [isOpen, setIsOpen] = useState(false)

    const onKeyDownInPopoverContent = useCallback<KeyboardEventHandler<HTMLDivElement>>(
        event => {
            if (event.key === 'Escape' && isOpen) {
                setIsOpen(false)
            }
        },
        [isOpen]
    )

    const onOpenChange = (open: boolean): void => {
        setIsOpen(open)
    }

    return (
        <Popover open={isOpen} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild onClick={() => setIsOpen(!isOpen)}>
                <Button variant="secondary" className="tw-w-full tw-bg-popover">
                    <span className="tw-flex tw-justify-between tw-items-center">
                        Switch Account
                        <span className="tw-w-4">
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="tw-flex tw-flex-col tw-w-full"
                side="bottom"
                align="center"
                onKeyDown={onKeyDownInPopoverContent}
            >
                {endpoints.map(endpoint => (
                    <Button
                        key={endpoint}
                        variant="ghost"
                        onClick={() => {
                            getVSCodeAPI().postMessage({
                                command: 'auth',
                                authKind: 'signin',
                                endpoint: endpoint,
                            })
                            setIsOpen(false)
                        }}
                    >
                        {endpoint}
                    </Button>
                ))}
            </PopoverContent>
        </Popover>
    )
}
