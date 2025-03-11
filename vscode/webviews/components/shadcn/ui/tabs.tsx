import * as TabsPrimitive from '@radix-ui/react-tabs'
import React from 'react'
import { cn } from '../utils'

export const TabRoot = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => {
    return <TabsPrimitive.Root ref={ref} {...props} orientation="vertical" className={className} />
})

export const TabContainer = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => {
    return (
        <TabsPrimitive.Content
            ref={ref}
            {...props}
            className={cn('tw-h-full tw-flex tw-flex-col tw-overflow-auto tw-gap-4', className)}
        />
    )
})

// Additional tab components for the responsive layout
export const TabsList = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
    return (
        <TabsPrimitive.List
            ref={ref}
            className={cn(
                'tw-flex tw-w-full tw-border-b tw-border-solid tw-border-border/30',
                className
            )}
            {...props}
        />
    )
})

export const TabsTrigger = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
    return (
        <TabsPrimitive.Trigger
            ref={ref}
            className={cn(
                'tw-flex tw-items-center tw-justify-center tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-ring-offset-background tw-transition-all focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-ring focus-visible:tw-ring-offset-2 disabled:tw-pointer-events-none data-[state=active]:tw-border-b-2 data-[state=active]:tw-border-foreground',
                className
            )}
            {...props}
        />
    )
})

export const TabsContent = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => {
    return (
        <TabsPrimitive.Content
            ref={ref}
            className={cn(
                'tw-flex-1 tw-flex tw-flex-col tw-overflow-auto',
                className
            )}
            {...props}
        />
    )
})

// Export a Tabs component for ease of use
export const Tabs = TabsPrimitive.Root
