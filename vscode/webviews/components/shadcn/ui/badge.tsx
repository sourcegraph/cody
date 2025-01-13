import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../utils'

const badgeVariants = cva(
    'tw-inline-flex tw-items-center tw-rounded-[6px] tw-px-[5px] tw-py-0 tw-text-xs focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-ring focus:tw-ring-offset-2',
    {
        variants: {
            variant: {
                secondary: 'tw-bg-badge-background tw-text-badge-foreground',
                outline: 'tw-border tw-border-muted-transparent tw-bg-[unset] tw-text-muted-foreground',
                ghost: 'tw-bg-muted-transparent tw-text-muted-foreground',
                cody: 'tw-bg-gradient-to-r tw-from-sourcegraph-blue tw-via-sourcegraph-purple tw-to-sourcegraph-orange tw-text-badge-foreground',
                warning: 'tw-bg-yellow-900 tw-text-yellow-300',
                info: 'tw-bg-blue-900 tw-text-blue-300',
                error: 'tw-bg-pink-900 tw-text-pink-300',
                disabled: 'tw-bg-gray-900 tw-text-gray-300',
            },
        },
        defaultVariants: {
            variant: 'secondary',
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
