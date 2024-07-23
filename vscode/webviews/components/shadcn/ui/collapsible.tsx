import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import clsx from 'clsx'
import type { ComponentProps } from 'react'

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

// Same as the standard shadcn/ui CollapsibleContent, but adds the required
// animation classes so it animates up and down like the accordian. This would
// make a great pull request to shadcn/ui if one does not already exist.
const CollapsibleContent = (props: ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) => (
    <CollapsiblePrimitive.CollapsibleContent
        className={clsx(
            // Radix adds data-state open/closed, and custom props for the
            // content height. The animation is configured in tailwind.config.js
            'tw-overflow-hidden tw-transition-all data-[state=closed]:tw-animate-collapsible-up data-[state=open]:tw-animate-collapsible-down',
            props.className
        )}
        {...props}
    />
)

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
