import * as LabelPrimitive from '@radix-ui/react-label'
import * as React from 'react'
import { cn } from '../utils'

const Label = React.forwardRef<
    React.ElementRef<typeof LabelPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
    <LabelPrimitive.Root
        ref={ref}
        className={cn(
            'tw-text-sm tw-font-medium tw-leading-none tw-text-foreground',
            'peer-disabled:tw-cursor-not-allowed peer-disabled:tw-opacity-70',
            className
        )}
        {...props}
    />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
