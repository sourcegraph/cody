import type { DialogProps } from '@radix-ui/react-dialog'
import { Command as CommandPrimitive } from 'cmdk'
import * as React from 'react'

import { cn } from '../utils'
import { Dialog, DialogContent } from './dialog'

const Command = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
    <CommandPrimitive
        ref={ref}
        className={cn(
            'tw-flex tw-h-full tw-w-full tw-flex-col tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground',
            className
        )}
        {...props}
    />
))
Command.displayName = CommandPrimitive.displayName

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
    return (
        <Dialog {...props}>
            <DialogContent className="tw-overflow-hidden tw-p-0 tw-shadow-lg">
                <Command className="[&_[cmdk-group-heading]]:tw-px-2 [&_[cmdk-group-heading]]:tw-font-medium [&_[cmdk-group-heading]]:tw-text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:tw-pt-0 [&_[cmdk-group]]:tw-px-2 [&_[cmdk-input-wrapper]_svg]:tw-h-5 [&_[cmdk-input-wrapper]_svg]:tw-w-5 [&_[cmdk-input]]:tw-h-12 [&_[cmdk-item]]:tw-px-2 [&_[cmdk-item]]:tw-py-3 [&_[cmdk-item]_svg]:tw-h-5 [&_[cmdk-item]_svg]:tw-w-5">
                    {children}
                </Command>
            </DialogContent>
        </Dialog>
    )
}

const CommandInput = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Input>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
    <div className="tw-flex tw-items-center tw-border-b tw-border-b-border" cmdk-input-wrapper="">
        <CommandPrimitive.Input
            ref={ref}
            className={cn(
                'tw-flex tw-w-full tw-border-solid tw-border tw-border-transparent tw-bg-transparent tw-p-3 tw-pt-4 tw-text-md tw-leading-none placeholder:tw-text-muted-foreground disabled:tw-cursor-not-allowed disabled:tw-opacity-50 focus:tw-outline-none',
                className
            )}
            inputMode="search"
            {...props}
        />
    </div>
))

CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.List
        ref={ref}
        className={cn('tw-max-h-[400px] tw-overflow-y-auto tw-overflow-x-hidden', className)}
        {...props}
    />
))

CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Empty>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
    <CommandPrimitive.Empty
        ref={ref}
        className="tw-pt-3 tw-pb-0 tw-px-2 tw-text-muted-foreground tw-font-medium tw-text-xs"
        {...props}
    />
))

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandLoading = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Loading>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Loading>
>((props, ref) => (
    <CommandPrimitive.Loading
        ref={ref}
        className="tw-pt-3 tw-pb-0 tw-px-2 tw-text-muted-foreground tw-font-medium tw-text-xs"
        {...props}
    />
))

const CommandGroup = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Group>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Group
        ref={ref}
        className={cn(
            'tw-overflow-hidden tw-p-2 tw-text-foreground [&:not(:last-child)]:tw-border-border [&:not(:last-child)]:tw-border-b [&_[cmdk-group-heading]]:tw-px-2 [&_[cmdk-group-heading]]:tw-py-1.5 [&_[cmdk-group-heading]]:tw-text-xs [&_[cmdk-group-heading]]:tw-font-medium [&_[cmdk-group-heading]]:tw-text-muted-foreground',
            className
        )}
        {...props}
    />
))

CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Separator
        ref={ref}
        className={cn('tw--mx-1 tw-my-2 tw-h-px tw-bg-border', className)}
        {...props}
    />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & { tooltip?: string }
>(({ className, tooltip, ...props }, ref) => {
    const item = (
        <CommandPrimitive.Item
            ref={ref}
            className={cn(
                'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-rounded-sm tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50',
                className
            )}
            title={tooltip}
            {...props}
        />
    )

    return item
})

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
    return (
        <span
            className={cn(
                'tw-ml-auto tw-text-xs tw-tracking-widest tw-text-muted-foreground',
                className
            )}
            {...props}
        />
    )
}
CommandShortcut.displayName = 'CommandShortcut'

export const CommandLink: React.FunctionComponent<
    React.AnchorHTMLAttributes<HTMLAnchorElement> & { onSelect?: () => void }
> = ({ href, className, children, onSelect, ...props }) => {
    const linkRef = React.useRef<HTMLAnchorElement>(null)

    // We use a workaround to make links work in VS Code via keyboard and click (see the
    // `dispatchEvent` call and related comment below). However, to avoid a click opening the link
    // twice, we need to check if we're already opening a link due to a click and prevent the
    // `dispatchEvent` code path from being called. When cmdk supports links
    // (https://github.com/pacocoursey/cmdk/issues/258), this workaround will no longer be needed.
    const isHandlingClick = React.useRef(false)

    return (
        <CommandItem
            onSelect={() => {
                onSelect?.()

                if (isHandlingClick.current) {
                    linkRef.current?.blur() // close after click
                    return
                }

                // TODO: When cmdk supports links, use that instead. This workaround is only needed
                // because the link's native onClick is not being fired because cmdk traps it. See
                // https://github.com/pacocoursey/cmdk/issues/258.
                //
                // This workaround successfully opens an external link in VS Code webviews (which
                // block `window.open` and plain click MouseEvents) and in browsers.
                try {
                    linkRef.current?.focus()
                    linkRef.current?.dispatchEvent(
                        new MouseEvent('click', {
                            button: 0,
                            ctrlKey: true,
                            metaKey: true,
                        })
                    )
                    linkRef.current?.blur()
                } catch (error) {
                    console.error(error)
                } finally {
                    isHandlingClick.current = false
                }
            }}
            asChild
        >
            <a
                {...props}
                href={href}
                className={cn(
                    '!tw-text-foreground aria-selected:!tw-text-accent-foreground hover:!tw-text-accent-foreground',
                    className
                )}
                onClick={e => {
                    isHandlingClick.current = true
                    setTimeout(() => {
                        isHandlingClick.current = false
                    })
                }}
                ref={linkRef}
            >
                {children}
            </a>
        </CommandItem>
    )
}

export {
    Command,
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandLoading,
    CommandGroup,
    CommandItem,
    CommandShortcut,
    CommandSeparator,
}
