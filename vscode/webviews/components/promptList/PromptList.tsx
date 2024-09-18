import { type CodyCommand, CustomCommandType, type Prompt } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { PlusIcon } from 'lucide-react'
import { type ComponentProps, type FunctionComponent, useCallback, useState } from 'react'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { useConfig } from '../../utils/useConfig'
import { useDebounce } from '../../utils/useDebounce'
import { Badge } from '../shadcn/ui/badge'
import { Button } from '../shadcn/ui/button'
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandLoading,
    CommandSeparator,
} from '../shadcn/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '../shadcn/ui/tooltip'
import { usePromptsQuery } from './usePromptsQuery'

export type PromptOrDeprecatedCommand =
    | { type: 'prompt'; value: Prompt }
    | { type: 'command'; value: CodyCommand }

type SelectActionLabel = 'insert' | 'run'

/**
 * A list of prompts from the Prompt Library. For backcompat, it also displays built-in commands and
 * custom commands (which are both deprecated in favor of the Prompt Library).
 *
 * It is used in the {@link PromptSelectField} in a popover and in {@link PromptsTab} as a list (not
 * in a popover).
 */
export const PromptList: React.FunctionComponent<{
    onSelect: (item: PromptOrDeprecatedCommand) => void
    onSelectActionLabels?: { prompt: SelectActionLabel; command: SelectActionLabel }
    showSearch?: boolean
    showOnlyPromptInsertableCommands?: boolean
    showInitialSelectedItem?: boolean
    showPromptLibraryUnsupportedMessage?: boolean
    showCommandOrigins?: boolean
    className?: string
    commandListClassName?: string
    telemetryLocation: 'PromptSelectField' | 'PromptsTab'
}> = ({
    onSelect: parentOnSelect,
    onSelectActionLabels,
    showSearch = true,
    showOnlyPromptInsertableCommands,
    showInitialSelectedItem = true,
    showPromptLibraryUnsupportedMessage = true,
    showCommandOrigins = false,
    className,
    commandListClassName,
    telemetryLocation,
}) => {
    const telemetryRecorder = useTelemetryRecorder()
    const telemetryPublicMetadata: Record<string, number> = {
        [`in${telemetryLocation}`]: 1,
    }

    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 250)
    const { value: result, error } = usePromptsQuery(debouncedQuery)

    const onSelect = useCallback(
        (rowValue: string): void => {
            const prompt =
                result?.prompts.type === 'results'
                    ? result.prompts.results.find(
                          p => commandRowValue({ type: 'prompt', value: p }) === rowValue
                      )
                    : undefined

            const standardPromptCommand =
                prompt === undefined
                    ? result?.standardPrompts?.find(
                          c => commandRowValue({ type: 'command', value: c }) === rowValue
                      )
                    : undefined

            const codyCommand =
                standardPromptCommand ??
                result?.commands?.find(c => commandRowValue({ type: 'command', value: c }) === rowValue)

            const entry: PromptOrDeprecatedCommand | undefined = prompt
                ? { type: 'prompt', value: prompt }
                : codyCommand
                  ? { type: 'command', value: codyCommand }
                  : undefined
            if (!entry) {
                return
            }
            telemetryRecorder.recordEvent('cody.promptList', 'select', {
                metadata: {
                    isPrompt: prompt ? 1 : 0,
                    isCommand: codyCommand ? 1 : 0,
                    isCommandBuiltin: codyCommand?.type === 'default' ? 1 : 0,
                    isCommandCustom: codyCommand?.type !== 'default' ? 1 : 0,
                    ...telemetryPublicMetadata,
                },
                privateMetadata: {
                    nameWithOwner: prompt ? prompt.nameWithOwner : undefined,
                },
            })
            if (result) {
                telemetryRecorder.recordEvent('cody.promptList', 'query', {
                    metadata: {
                        queryLength: debouncedQuery.length,
                        resultCount:
                            (result.prompts.type === 'results' ? result.prompts.results.length : 0) +
                            (result.commands?.length ?? 0),
                        resultCountPromptsOnly:
                            result.prompts.type === 'results' ? result.prompts.results.length : 0,
                        resultCountCommandsOnly: result.commands?.length ?? 0,
                        supportsPrompts: result.prompts.type !== 'unsupported' ? 1 : 0,
                        hasUsePromptsQueryError: error ? 1 : 0,
                        hasPromptsResultError: result.prompts.type === 'error' ? 1 : 0,
                        ...telemetryPublicMetadata,
                    },
                    privateMetadata: {
                        query: debouncedQuery,
                        usePromptsQueryErrorMessage: error?.message,
                        promptsResultErrorMessage:
                            result.prompts.type === 'error' ? result.prompts.error : undefined,
                    },
                })
            }
            parentOnSelect(entry)
        },
        [
            result,
            telemetryRecorder.recordEvent,
            parentOnSelect,
            telemetryPublicMetadata,
            debouncedQuery,
            error,
        ]
    )

    const endpointURL = new URL(useConfig().authStatus.endpoint)

    // Don't show builtin commands to insert in the prompt editor.
    const filteredCommands = showOnlyPromptInsertableCommands
        ? result?.commands.filter(c => c.type !== 'default')
        : result?.commands

    return (
        <Command
            loop={true}
            tabIndex={0}
            className={clsx('focus:tw-outline-none', className)}
            shouldFilter={false}
            defaultValue={showInitialSelectedItem ? undefined : 'xxx-no-item'}
        >
            <CommandList
                className={clsx(
                    '[&_[cmdk-group]]:tw-pt-0 [&_[cmdk-group-heading]]:tw-flex [&_[cmdk-group-heading]]:tw-gap-2 [&_[cmdk-group-heading]]:tw-items-center [&_[cmdk-group-heading]]:!tw-min-h-[30px] [&_[cmdk-group-heading]]:tw--mx-2 [&_[cmdk-group-heading]]:tw-px-4 [&_[cmdk-group-heading]]:tw-mb-2 [&_[cmdk-group-heading]]:tw-bg-muted [&_[cmdk-group]]:!tw-border-0',
                    commandListClassName
                )}
            >
                {showSearch && (
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Search..."
                        autoFocus={true}
                    />
                )}
                {result && result.prompts.type !== 'unsupported' && (
                    <CommandGroup
                        heading={
                            <>
                                <span>Prompt Library</span>
                                <div className="tw-flex-grow" />
                                <Button variant="ghost" size="sm" asChild>
                                    <a
                                        href={new URL('/prompts', endpointURL).toString()}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="!tw-text-[unset]"
                                    >
                                        Manage
                                    </a>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="tw-flex tw-items-center tw-gap-0.5"
                                    asChild
                                >
                                    <a
                                        href={new URL('/prompts/new', endpointURL).toString()}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="!tw-text-[unset]"
                                    >
                                        <PlusIcon size={12} strokeWidth={1.25} />
                                        New
                                    </a>
                                </Button>
                            </>
                        }
                    >
                        {result.prompts.type === 'results' ? (
                            <>
                                {result.prompts.results.length === 0 && (
                                    <CommandLoading>
                                        {result.query === '' ? (
                                            <>
                                                Your Prompt Library is empty.{' '}
                                                <a
                                                    href={new URL(
                                                        '/prompts/new',
                                                        endpointURL
                                                    ).toString()}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    Add a prompt
                                                </a>{' '}
                                                to reuse and share it.
                                            </>
                                        ) : (
                                            <>No prompts found</>
                                        )}
                                    </CommandLoading>
                                )}
                                {result.prompts.results.map(prompt => (
                                    <PromptCommandItem
                                        key={prompt.id}
                                        prompt={prompt}
                                        onSelect={onSelect}
                                        selectActionLabel={onSelectActionLabels?.prompt}
                                    />
                                ))}
                            </>
                        ) : null}
                        {result.prompts.type === 'error' && (
                            <CommandLoading>Error: {result.prompts.error}</CommandLoading>
                        )}
                    </CommandGroup>
                )}
                {!showOnlyPromptInsertableCommands &&
                    result?.standardPrompts &&
                    result.standardPrompts.length > 0 && (
                        <CommandGroup heading={<span>Standard Prompts</span>}>
                            {result.standardPrompts.map(command => (
                                <CodyCommandItem
                                    key={command.key}
                                    command={command}
                                    onSelect={onSelect}
                                    selectActionLabel={onSelectActionLabels?.prompt}
                                    showCommandOrigins={false}
                                />
                            ))}
                        </CommandGroup>
                    )}
                {result && filteredCommands && filteredCommands.length > 0 && (
                    <CommandGroup
                        heading={
                            <>
                                <span>Commands</span>
                                <div className="tw-flex-grow" />
                                {hasCustomCommands(filteredCommands) && (
                                    <Button variant="ghost" size="sm" asChild>
                                        <a
                                            className="!tw-text-[unset]"
                                            href="command:cody.menu.commands-settings"
                                        >
                                            Manage
                                        </a>
                                    </Button>
                                )}
                            </>
                        }
                    >
                        {filteredCommands.map(command => (
                            <CodyCommandItem
                                key={command.key}
                                command={command}
                                onSelect={onSelect}
                                selectActionLabel={onSelectActionLabels?.command}
                                showCommandOrigins={showCommandOrigins}
                            />
                        ))}
                    </CommandGroup>
                )}
                {showPromptLibraryUnsupportedMessage &&
                    result &&
                    result.prompts.type === 'unsupported' && (
                        <>
                            <CommandSeparator alwaysRender={true} />
                            <CommandLoading className="tw-px-4">
                                Prompt Library is not yet available on {endpointURL.hostname}. Ask your
                                site admin to upgrade to Sourcegraph 5.6 or later.
                            </CommandLoading>
                        </>
                    )}
                {!result && !error && <CommandLoading className="tw-px-4">Loading...</CommandLoading>}
                {error && (
                    <CommandLoading className="tw-px-4">
                        Error: {error.message || 'unknown'}
                    </CommandLoading>
                )}
            </CommandList>
        </Command>
    )
}

function hasCustomCommands(commands: CodyCommand[]): boolean {
    return commands.some(
        command =>
            command.type === CustomCommandType.Workspace || command.type === CustomCommandType.User
    )
}

function commandRowValue(row: PromptOrDeprecatedCommand): string {
    return row.type === 'prompt' ? `prompt-${row.value.id}` : `command-${row.value.key}`
}

const PromptCommandItem: FunctionComponent<{
    prompt: Prompt
    onSelect: (value: string) => void
    selectActionLabel: SelectActionLabel | undefined
}> = ({ prompt, onSelect, selectActionLabel }) => (
    <CommandItem
        value={commandRowValue({ type: 'prompt', value: prompt })}
        onSelect={onSelect}
        className="!tw-items-start tw-group/[cmdk-item]"
    >
        <div>
            <div className="tw-flex tw-gap-3 tw-w-full tw-items-start">
                <span>
                    <span className="tw-text-muted-foreground">{prompt.owner.namespaceName} / </span>
                    <strong>{prompt.name}</strong>
                </span>
                {prompt.draft && (
                    <Badge variant="secondary" className="tw-text-xxs tw-mt-0.5">
                        Draft
                    </Badge>
                )}
            </div>
            {prompt.description && (
                <span className="tw-text-xs tw-text-muted-foreground tw-text-nowrap tw-overflow-hidden tw-text-ellipsis tw-w-full">
                    {prompt.description}
                </span>
            )}
        </div>
        <div className="tw-flex-grow" />
        {selectActionLabel && <CommandItemAction label={selectActionLabel} />}
    </CommandItem>
)

const CodyCommandItem: FunctionComponent<{
    command: CodyCommand
    onSelect: (value: string) => void
    selectActionLabel: SelectActionLabel | undefined
    showCommandOrigins: boolean
}> = ({ command, onSelect, selectActionLabel, showCommandOrigins }) => (
    <CommandItem
        value={commandRowValue({ type: 'command', value: command })}
        onSelect={onSelect}
        className="!tw-items-start tw-group/[cmdk-item]"
    >
        <div>
            <div className="tw-flex tw-flex-wrap tw-gap-3 tw-w-full tw-items-start">
                <strong className="tw-whitespace-nowrap">
                    {command.type === 'default' ? command.description : command.key}
                </strong>
                {showCommandOrigins && command.type !== 'default' && (
                    <Badge variant="secondary" className="tw-text-xxs tw-mt-0.5 tw-whitespace-nowrap">
                        {command.type === CustomCommandType.User
                            ? 'Local User Settings'
                            : 'Workspace Settings'}
                    </Badge>
                )}
            </div>
            {command.type !== 'default' && command.description && (
                <span className="tw-text-xs tw-text-muted-foreground tw-text-nowrap tw-overflow-hidden tw-text-ellipsis tw-w-full">
                    {command.description}
                </span>
            )}
        </div>
        <div className="tw-flex-grow" />
        {selectActionLabel && <CommandItemAction label={selectActionLabel} />}
    </CommandItem>
)

/** Indicator for what will occur when a CommandItem is selected. */
const CommandItemAction: FunctionComponent<{ label: SelectActionLabel; className?: string }> = ({
    label,
    className,
}) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button
                type="button"
                variant="default"
                size="xs"
                className={clsx(
                    'tw-tracking-tight tw-text-accent-foreground tw-opacity-30 tw-bg-transparent hover:tw-bg-transparent tw-invisible group-[[aria-selected="true"]]/[cmdk-item]:tw-visible group-hover/[cmdk-item]:tw-visible',
                    className
                )}
            >
                {label === 'insert' ? 'Insert' : 'Run'}
            </Button>
        </TooltipTrigger>
        <TooltipContent>
            {label === 'insert'
                ? 'Append prompt text to chat message'
                : 'Run command on current selection in editor'}
        </TooltipContent>
    </Tooltip>
)

/**
 * A variant of {@link PromptList} that is visually more suited for a non-popover.
 */
export const PromptListSuitedForNonPopover: FunctionComponent<
    Omit<ComponentProps<typeof PromptList>, 'showSearch' | 'showInitialSelectedItem'>
> = ({ className, commandListClassName, ...props }) => (
    <PromptList
        {...props}
        showSearch={false}
        showInitialSelectedItem={false}
        className={clsx('tw-w-full !tw-max-w-[unset] !tw-bg-[unset]', className)}
        commandListClassName={clsx('!tw-max-h-[unset]', commandListClassName)}
    />
)
