import * as Tabs from '@radix-ui/react-tabs'
import React from 'react'

export const TabRoot = React.forwardRef<
    React.ElementRef<typeof Tabs.Root>,
    React.ComponentPropsWithoutRef<typeof Tabs.Root>
>(({ className, ...props }, ref) => {
    return <Tabs.Root ref={ref} {...props} orientation="vertical" className={className} />
})

export const TabContainer = React.forwardRef<
    React.ElementRef<typeof Tabs.Content>,
    React.ComponentPropsWithoutRef<typeof Tabs.Content>
>(({ className, ...props }, ref) => {
    return (
        <Tabs.Content
            ref={ref}
            {...props}
            className="tw-h-full tw-flex tw-flex-col tw-overflow-auto tw-gap-4"
        />
    )
})
