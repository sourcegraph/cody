import type { Prompt } from '@sourcegraph/cody-shared'
import { ExternalLinkIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { useConfig } from '../../utils/useConfig'
import { useDebounce } from '../../utils/useDebounce'
import { Badge } from '../shadcn/ui/badge'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandLink,
    CommandList,
    CommandLoading,
} from '../shadcn/ui/command'
import { ToolbarPopoverItem } from '../shadcn/ui/toolbar'
import { cn } from '../shadcn/utils'
import { usePromptsQuery } from './usePromptsQuery'

export const PromptSelectField: React.FunctionComponent<{
    onSelect?: (prompt: Prompt) => void
    onCloseByEscape?: () => void
    className?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({ onSelect: parentOnSelect, onCloseByEscape, className, __storybook__open }) => {
    const telemetryRecorder = useTelemetryRecorder()

    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 250)
    const { value: prompts, error } = usePromptsQuery(debouncedQuery)

    // Query and error telemetry.
    useEffect(() => {
        if (prompts) {
            telemetryRecorder.recordEvent('cody.promptSelectField', 'query', {
                metadata: { queryLength: query.length, resultCount: prompts.length },
                privateMetadata: {
                    query,
                },
            })
        }
    }, [prompts, query, telemetryRecorder.recordEvent])
    useEffect(() => {
        if (error) {
            telemetryRecorder.recordEvent('cody.promptSelectField', 'error', {
                metadata: { queryLength: query.length },
                privateMetadata: { errorMessage: error.message },
            })
        }
    }, [error, telemetryRecorder.recordEvent, query.length])

    const onSelect = useCallback(
        (promptID: Prompt['id']): void => {
            const prompt = prompts?.find(m => m.id === promptID)
            if (!prompt) {
                return // data changed right after the user selected it, so do nothing
            }
            telemetryRecorder.recordEvent('cody.promptSelectField', 'select', {
                privateMetadata: {
                    nameWithOwner: prompt.nameWithOwner,
                },
            })
            parentOnSelect?.(prompt)
        },
        [prompts, telemetryRecorder.recordEvent, parentOnSelect]
    )

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                telemetryRecorder.recordEvent('cody.promptSelectField', 'open', {})
            }
        },
        [telemetryRecorder.recordEvent]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    const endpointURL = new URL(useConfig().authStatus.endpoint)

    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd="chevron"
            className={cn('tw-justify-between', className)}
            __storybook__open={__storybook__open}
            tooltip="Insert prompt from Prompt Library"
            aria-label="Insert prompt"
            popoverContent={close => (
                <Command
                    loop={true}
                    tabIndex={0}
                    className="focus:tw-outline-none tw-max-w-[min(500px,90vw)]"
                    shouldFilter={false}
                >
                    <CommandList>
                        <CommandInput
                            value={query}
                            onValueChange={setQuery}
                            placeholder="Search prompts..."
                            autoFocus={true}
                        />
                        {prompts ? (
                            prompts.length > 0 ? (
                                <>
                                    <CommandGroup>
                                        {prompts.map(prompt => (
                                            <CommandItem
                                                key={prompt.id}
                                                value={prompt.id}
                                                onSelect={currentValue => {
                                                    onSelect(currentValue)
                                                    close()
                                                }}
                                                className="tw-flex-col !tw-items-start"
                                            >
                                                <div className="tw-flex tw-gap-2 tw-w-full tw-items-start">
                                                    <span>
                                                        {prompt.owner.namespaceName}/
                                                        <strong>{prompt.name}</strong>
                                                    </span>
                                                    <div className="tw-flex-grow" />
                                                    {prompt.draft && (
                                                        <Badge
                                                            variant="secondary"
                                                            className="tw-text-xs"
                                                        >
                                                            Draft
                                                        </Badge>
                                                    )}
                                                </div>
                                                {prompt.description && (
                                                    <span className="tw-text-xs tw-text-muted-foreground tw-text-nowrap tw-overflow-hidden tw-text-ellipsis tw-w-full">
                                                        {prompt.description}
                                                    </span>
                                                )}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                    <CommandGroup>
                                        <CommandLink
                                            href={new URL('/prompts', endpointURL).toString()}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="tw-flex tw-items-center tw-justify-between tw-gap-3"
                                        >
                                            Prompt Library
                                            <ExternalLinkIcon
                                                size={16}
                                                strokeWidth={1.25}
                                                className="tw-opacity-80"
                                            />
                                        </CommandLink>
                                        <CommandLink
                                            href={new URL('/prompts/new', endpointURL).toString()}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="tw-flex tw-items-center tw-justify-between tw-gap-3"
                                        >
                                            Add New Prompt to Library
                                            <ExternalLinkIcon
                                                size={16}
                                                strokeWidth={1.25}
                                                className="tw-opacity-80"
                                            />
                                        </CommandLink>
                                    </CommandGroup>
                                </>
                            ) : (
                                <CommandEmpty>No matches</CommandEmpty>
                            )
                        ) : error ? (
                            <CommandEmpty>Error: {error.message}</CommandEmpty>
                        ) : (
                            <CommandLoading>Loading...</CommandLoading>
                        )}
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
            Prompts
        </ToolbarPopoverItem>
    )
}
