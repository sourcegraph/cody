import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as React from 'react'

import { cn } from '../utils'

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 5, ...props }, ref) => {
    const portalRef = React.useRef<HTMLDivElement>(null)
    return (
        <>
            {/* Use a portal that's in the same DOM tree to make focus handling easier. */}
            <div ref={portalRef} className="empty:tw-hidden" />
            {portalRef.current && (
                <PopoverPrimitive.Portal container={portalRef.current}>
                    <PopoverPrimitive.Content
                        ref={ref}
                        align={align}
                        sideOffset={sideOffset}
                        className={cn(
                            'tw-z-50 tw-w-72 tw-rounded-md tw-border tw-border-ring tw-bg-popover tw-p-4 tw-text-popover-foreground tw-shadow-md tw-outline-none',
                            className
                        )}
                        {...props}
                    />
                </PopoverPrimitive.Portal>
            )}
        </>
    )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
