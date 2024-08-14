import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../utils'

const roundedIconStyles = 'tw-flex tw-items-center tw-justify-center !tw-rounded-full !tw-p-2 tw-border'

const buttonVariants = cva(
    'tw-inline-flex tw-items-center tw-justify-center tw-whitespace-nowrap tw-rounded-md focus-visible:tw-border-ring focus-visible:tw-outline-none disabled:tw-pointer-events-none disabled:tw-opacity-50 tw-gap-3 tw-transition tw-duration-75 tw-cursor-pointer',
    {
        variants: {
            variant: {
                default:
                    'tw-bg-button-background tw-text-button-foreground hover:tw-bg-button-background-hover focus-visible:tw-bg-primary-hover',
                outline:
                    'tw-border tw-border-border tw-bg-background hover:tw-bg-muted hover:tw-text-foreground',
                secondary:
                    'tw-bg-button-secondary-background tw-text-button-secondary-foreground hover:tw-bg-button-secondary-background-hover disabled:tw-opacity-75',
                ghost: 'hover:tw-bg-muted-transparent',
                text: 'tw-text-foreground tw-bg-transparent tw-items-end tw-border-none tw-transition-all tw-items-center tw-px-0 tw-w-full tw-text-left',
                link: 'tw-text-link tw-underline-offset-4 hover:tw-underline hover:tw-text-link-hover',
                primaryRoundedIcon: `${roundedIconStyles} tw-border tw-border-button-border tw-bg-button-background tw-text-button-foreground hover:tw-bg-button-background-hover disabled:tw-bg-current-25 disabled:tw-text-current`,
                outlineRoundedIcon: `${roundedIconStyles} tw-border tw-border-border`,
                ghostRoundedIcon: `${roundedIconStyles} tw-border-transparent`,
            },

            size: {
                default: 'tw-px-4 tw-py-2',
                xs: 'tw-rounded-sm tw-px-2 tw-text-xs',
                sm: 'tw-rounded-md tw-px-2 tw-py-[.1rem]',
                lg: 'tw-rounded-md tw-px-8',
                icon: 'tw-rounded-lg tw-w-[1.375rem] tw-h-[1.375rem]', // Match VS Code’s 22px icon buttons
                none: 'tw-p-0',
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
