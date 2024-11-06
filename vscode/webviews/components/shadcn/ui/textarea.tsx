import * as React from 'react'
import { cn } from '../utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    'tw-flex tw-min-h-[60px] tw-w-full tw-rounded-md tw-border tw-border-input tw-bg-input-background tw-px-3 tw-py-2 tw-text-input-foreground',
                    'tw-placeholder:text-muted-foreground',
                    'focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-ring',
                    'disabled:tw-cursor-not-allowed disabled:tw-opacity-50',
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = 'Textarea'
