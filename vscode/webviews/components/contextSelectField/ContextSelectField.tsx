import { ExternalLinkIcon } from 'lucide-react'
import { useCallback } from 'react'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { Command, CommandGroup, CommandItem, CommandLink, CommandList } from '../shadcn/ui/command'
import { ToolbarPopoverItem } from '../shadcn/ui/toolbar'
import { cn } from '../shadcn/utils'
import type { Context, ContextsContext } from './contexts'

const NULL_CONTEXT_ID = '<null-context>'

export const ContextSelectField: React.FunctionComponent<
    ContextsContext & {
        onCloseByEscape?: () => void
        className?: string

        /** For storybooks only. */
        __storybook__open?: boolean
    }
> = ({
    contexts,
    currentContext,
    onCurrentContextChange: parentOnCurrentContextChange,
    onCloseByEscape,
    className,
    __storybook__open,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const onCurrentContextChange = useCallback(
        (context: Context | null): void => {
            telemetryRecorder.recordEvent('cody.contextSelector', 'select', {
                metadata: {
                    isNullContext: context === null ? 1 : 0,
                },
                privateMetadata: {
                    contextName: context ? context.name : '<null>',
                },
            })
            parentOnCurrentContextChange(context)
        },
        [telemetryRecorder.recordEvent, parentOnCurrentContextChange]
    )

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                telemetryRecorder.recordEvent('cody.contextSelector', 'open', {
                    metadata: {
                        totalContexts: contexts.length,
                    },
                })
            }
        },
        [telemetryRecorder.recordEvent, contexts.length]
    )

    const onChange = useCallback(
        (value: string | undefined) => {
            onCurrentContextChange(
                value === NULL_CONTEXT_ID ? null : contexts.find(m => m.id === value)!
            )
        },
        [onCurrentContextChange, contexts]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    if (!contexts.length) {
        return null
    }

    const value = currentContext !== null ? currentContext.id : NULL_CONTEXT_ID
    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd="chevron"
            className={cn('tw-justify-between', className)}
            __storybook__open={__storybook__open}
            tooltip="Select shared context"
            aria-label="Select shared context"
            popoverContent={close => (
                <Command loop={true} defaultValue={value} tabIndex={0} className="focus:tw-outline-none">
                    <CommandList>
                        <CommandGroup>
                            {contexts.map(context => (
                                <CommandItem
                                    key={context.id}
                                    value={context.id}
                                    onSelect={currentValue => {
                                        onChange(currentValue)
                                        close()
                                    }}
                                    className="tw-flex tw-items-center tw-gap-2"
                                >
                                    {context.name}{' '}
                                    {context.description && (
                                        <span className="tw-text-muted-foreground tw-text-sm">
                                            {context.description}
                                        </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup>
                            <CommandLink
                                // TODO!(sqs): get correct url
                                href="https://sourcegraph.test:3443/contexts"
                                target="_blank"
                                rel="noreferrer"
                                className="tw-flex tw-items-center tw-justify-between"
                            >
                                Documentation
                                <ExternalLinkIcon
                                    size={16}
                                    strokeWidth={1.25}
                                    className="tw-opacity-80"
                                />
                            </CommandLink>
                        </CommandGroup>
                    </CommandList>
                </Command>
            )}
            popoverRootProps={{ onOpenChange }}
            popoverContentProps={{
                className: 'tw-min-w-[325px] tw-w-[unset] tw-max-w-[90%] !tw-p-0',
                onKeyDown: onKeyDown,
                onCloseAutoFocus: event => {
                    // Prevent the popover trigger from stealing focus after the user selects an
                    // item. We want the focus to return to the editor.
                    event.preventDefault()
                },
            }}
        >
            {currentContext !== null ? currentContext.name : 'Context...'}
        </ToolbarPopoverItem>
    )
}
