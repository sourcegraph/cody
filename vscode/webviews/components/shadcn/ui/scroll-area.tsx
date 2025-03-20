import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import * as React from 'react'

import { cn } from '../utils'

const ScrollArea = React.forwardRef<
    React.ElementRef<typeof ScrollAreaPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
    <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn('tw-relative tw-overflow-hidden', className)}
        {...props}
    >
        <ScrollAreaPrimitive.Viewport className="tw-h-full tw-w-full tw-rounded-[inherit]">
            {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
    React.ElementRef<typeof ScrollAreaPrimitive.Scrollbar>,
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
    <ScrollAreaPrimitive.Scrollbar
        ref={ref}
        orientation={orientation}
        className={cn(
            'tw-flex tw-touch-none tw-select-none tw-transition-colors',
            orientation === 'vertical'
                ? 'tw-h-full tw-w-2.5 tw-border-l tw-border-l-transparent tw-p-[1px]'
                : 'tw-h-2.5 tw-border-t tw-border-t-transparent tw-p-[1px]',
            className
        )}
        {...props}
    >
        <ScrollAreaPrimitive.Thumb className="tw-relative tw-flex-1 tw-rounded-full tw-bg-border" />
    </ScrollAreaPrimitive.Scrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.Scrollbar.displayName

export { ScrollArea, ScrollBar }
