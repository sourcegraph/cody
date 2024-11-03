import * as React from 'react'
import { cn } from '../utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'tw-flex tw-w-full tw-rounded-md tw-border tw-border-input tw-bg-input-background tw-px-3 tw-py-1.5 tw-text-input-foreground tw-ring-offset-background',
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
Input.displayName = 'Input'

export { Input }
