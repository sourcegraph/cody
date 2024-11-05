import * as SwitchPrimitives from '@radix-ui/react-switch'
import * as React from 'react'
import { cn } from '../utils'

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
        className={cn(
            'peer tw-inline-flex tw-h-4 tw-w-6 tw-shrink-0 tw-cursor-pointer tw-items-center tw-rounded-full tw-border-2 tw-border-transparent tw-shadow-sm tw-transition-colors focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-ring focus:tw-ring-offset-2 focus:tw-ring-offset-background disabled:tw-cursor-not-allowed disabled:tw-opacity-50 tw-text-muted-foreground data-[state=checked]:tw-bg-button-background data-[state=unchecked]:tw-bg-muted-foreground',
            className
        )}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className={cn(
                'tw-pointer-events-none tw-block tw-h-3 tw-w-4 tw-rounded-full tw-bg-sidebar-foreground tw-shadow-lg tw-ring-0 tw-transition-transform data-[state=checked]:tw-translate-x-1 data-[state=unchecked]:translate-x-0'
            )}
        />
    </SwitchPrimitives.Root>
))

Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
