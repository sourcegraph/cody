import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../utils'

const buttonVariants = cva(
    'tw-inline-flex tw-items-center tw-justify-center tw-whitespace-nowrap tw-rounded-md focus-visible:tw-border-ring focus-visible:tw-outline-none disabled:tw-pointer-events-none disabled:tw-opacity-50',
    {
        variants: {
            variant: {
                default: 'tw-bg-primary tw-text-primary-foreground hover:tw-bg-primary/90',
                outline:
                    'tw-border tw-border-border tw-bg-background hover:tw-bg-muted-transparent hover:tw-text-foreground',
                toolbarItem:
                    'tw-border tw-border-border tw-bg-none hover:tw-text-accent-foreground disabled:tw-border-transparent',
                secondary: 'tw-bg-secondary tw-text-secondary-foreground hover:tw-bg-secondary/80',
                ghost: 'hover:tw-bg-border hover:tw-bg-border',
                link: 'tw-text-primary tw-underline-offset-4 hover:tw-underline',
            },

            size: {
                default: 'tw-px-4 tw-py-2',
                sm: 'tw-rounded-md tw-px-2 tw-py-[.1rem] tw-text-sm',
                lg: 'tw-rounded-md tw-px-8 tw-text-lg',
                icon: 'tw-rounded-lg tw-w-[1.375rem] tw-h-[1.375rem]', // Match VS Code’s 22px icon buttons
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    }
)
Button.displayName = 'Button'
