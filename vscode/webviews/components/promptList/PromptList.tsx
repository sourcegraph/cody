import type { Prompt } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
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
import { usePromptsQuery } from './usePromptsQuery'

export const PromptList: React.FunctionComponent<{
    onSelect?: (prompt: Prompt) => void
    className?: string
    telemetryLocation: 'PromptSelectField' | 'PromptsTab'
}> = ({ onSelect: parentOnSelect, className, telemetryLocation }) => {
    const telemetryRecorder = useTelemetryRecorder()
    const telemetryPublicMetadata: Record<string, number> = {
        [`in${telemetryLocation}`]: 1,
    }

    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 250)
    const { value: prompts, error } = usePromptsQuery(debouncedQuery)

    // Query and error telemetry.
    useEffect(() => {
        if (prompts) {
            telemetryRecorder.recordEvent('cody.promptList', 'query', {
                metadata: {
                    queryLength: query.length,
                    resultCount: prompts.length,
                    ...telemetryPublicMetadata,
                },
                privateMetadata: {
                    query,
                },
            })
        }
    }, [prompts, query, telemetryRecorder.recordEvent, telemetryPublicMetadata])
    useEffect(() => {
        if (error) {
            telemetryRecorder.recordEvent('cody.promptList', 'error', {
                metadata: { queryLength: query.length, ...telemetryPublicMetadata },
                privateMetadata: { errorMessage: error.message },
            })
        }
    }, [error, telemetryRecorder.recordEvent, query.length, telemetryPublicMetadata])

    const onSelect = useCallback(
        (promptID: Prompt['id']): void => {
            const prompt = prompts?.find(m => m.id === promptID)
            if (!prompt) {
                return // data changed right after the user selected it, so do nothing
            }
            telemetryRecorder.recordEvent('cody.promptList', 'select', {
                metadata: { ...telemetryPublicMetadata },
                privateMetadata: {
                    nameWithOwner: prompt.nameWithOwner,
                },
            })
            parentOnSelect?.(prompt)
        },
        [prompts, telemetryRecorder.recordEvent, parentOnSelect, telemetryPublicMetadata]
    )

    const endpointURL = new URL(useConfig().authStatus.endpoint)

    return (
        <Command
            loop={true}
            tabIndex={0}
            className={clsx('focus:tw-outline-none', className)}
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
                                        onSelect={onSelect}
                                        className="tw-flex-col !tw-items-start"
                                    >
                                        <div className="tw-flex tw-gap-2 tw-w-full tw-items-start">
                                            <span>
                                                {prompt.owner.namespaceName}/
                                                <strong>{prompt.name}</strong>
                                            </span>
                                            <div className="tw-flex-grow" />
                                            {prompt.draft && (
                                                <Badge variant="secondary" className="tw-text-xs">
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
    )
}
