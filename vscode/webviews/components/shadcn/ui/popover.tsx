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
                            'tw-z-50 tw-w-72 tw-rounded-md tw-border tw-border-ring tw-bg-popover tw-p-4 tw-text-popover-foreground tw-shadow-md tw-outline-none data-[state=open]:tw-animate-in data-[state=closed]:tw-animate-out data-[state=closed]:tw-fade-out-0 data-[state=open]:tw-fade-in-0 data-[state=closed]:tw-zoom-out-95 data-[state=open]:tw-zoom-in-95 data-[side=bottom]:tw-slide-in-from-top-2 data-[side=left]:tw-slide-in-from-right-2 data-[side=right]:tw-slide-in-from-left-2 data-[side=top]:tw-slide-in-from-bottom-2',
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
