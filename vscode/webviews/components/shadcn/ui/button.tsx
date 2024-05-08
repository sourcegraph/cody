import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../utils'

const buttonVariants = cva(
    'tw-inline-flex tw-items-center tw-justify-center tw-whitespace-nowrap tw-rounded-md tw-font-medium tw-transition-colors focus-visible:tw-border-ring focus-visible:tw-outline-none disabled:tw-pointer-events-none disabled:tw-opacity-50',
    {
        variants: {
            variant: {
                default: 'tw-bg-primary tw-text-primary-foreground hover:tw-bg-primary/90',
                outline:
                    'tw-border tw-border-input tw-bg-background hover:tw-bg-accent hover:tw-text-accent-foreground',
                combobox:
                    'tw-border tw-border-input tw-bg-background hover:tw-bg-accent hover:tw-text-accent-foreground disabled:!tw-opacity-100 disabled:tw-border-transparent',
                secondary: 'tw-bg-secondary tw-text-secondary-foreground hover:tw-bg-secondary/80',
                ghost: 'hover:tw-bg-accent hover:tw-text-accent-foreground',
                link: 'tw-text-primary tw-underline-offset-4 hover:tw-underline',
            },

            size: {
                default: 'tw-px-4 tw-py-2',
                sm: 'tw-rounded-md tw-px-3 tw-text-sm',
                lg: 'tw-rounded-md tw-px-8 tw-text-lg',
                icon: 'tw-w-10',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
