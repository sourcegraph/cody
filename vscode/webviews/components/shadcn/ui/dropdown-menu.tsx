import * as React from 'react'
import { cn } from '../utils'

const DropdownMenu = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn('tw-relative tw-inline-block', className)} {...props} />
    )
)
DropdownMenu.displayName = 'DropdownMenu'

const DropdownMenuTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
    if (asChild) {
        return (
            <button ref={ref} className={cn('tw-cursor-pointer tw-inline-flex', className)} {...props} />
        )
    }
    return <button ref={ref} className={cn('tw-cursor-pointer tw-inline-flex', className)} {...props} />
})
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

const DropdownMenuContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'tw-z-50 tw-min-w-[8rem] tw-overflow-hidden tw-rounded-md tw-border tw-border-input-border tw-bg-background tw-p-1 tw-shadow-md',
                className
            )}
            {...props}
        />
    )
)
DropdownMenuContent.displayName = 'DropdownMenuContent'

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('tw-px-2 tw-py-1.5 tw-text-sm tw-font-semibold', className)}
            {...props}
        />
    )
)
DropdownMenuLabel.displayName = 'DropdownMenuLabel'

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn('tw-my-1 tw-h-px tw-bg-input-border', className)} {...props} />
    )
)
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'

const DropdownMenuGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => <div ref={ref} className={cn('tw-p-1', className)} {...props} />
)
DropdownMenuGroup.displayName = 'DropdownMenuGroup'

const DropdownMenuItem = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }
>(({ className, disabled, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-rounded-sm tw-px-2 tw-py-1.5 tw-text-sm tw-outline-none tw-transition-colors hover:tw-bg-accent',
            disabled && 'tw-pointer-events-none tw-opacity-50',
            className
        )}
        {...props}
    />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

const DropdownMenuShortcut = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
    ({ className, ...props }, ref) => (
        <span
            ref={ref}
            className={cn('tw-ml-auto tw-text-xs tw-tracking-widest tw-opacity-60', className)}
            {...props}
        />
    )
)
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'

const DropdownMenuSub = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn('tw-relative', className)} {...props} />
    )
)
DropdownMenuSub.displayName = 'DropdownMenuSub'

const DropdownMenuSubTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-rounded-sm tw-px-2 tw-py-1.5 tw-text-sm tw-outline-none tw-transition-colors hover:tw-bg-accent',
                className
            )}
            {...props}
        />
    )
)
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger'

const DropdownMenuSubContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'tw-z-50 tw-min-w-[8rem] tw-overflow-hidden tw-rounded-md tw-border tw-border-input-border tw-bg-background tw-p-1 tw-shadow-md',
                className
            )}
            {...props}
        />
    )
)
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent'

const DropdownMenuPortal = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn('tw-absolute tw-left-0', className)} {...props} />
    )
)
DropdownMenuPortal.displayName = 'DropdownMenuPortal'

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuPortal,
}
