import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'
import { cn } from '../utils'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
            'tw-z-50 tw-overflow-hidden tw-flex tw-items-center tw-rounded-md tw-border tw-border-border tw-leading-tight tw-bg-popover tw-px-3 tw-py-2 tw-text-sm tw-text-popover-foreground tw-max-w-72 tw-text-center tw-whitespace-pre-line tw-shadow-lg [&_kbd]:tw-ml-3 [&_kbd]:-tw-mr-1 [&_kbd]:tw-mt-[-4px] [&_kbd]:tw-mb-[-4px]',
            className
        )}
        {...props}
    >
        {props.children}
    </TooltipPrimitive.Content>
))

TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
