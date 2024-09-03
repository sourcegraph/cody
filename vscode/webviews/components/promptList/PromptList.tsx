import type { CodyCommand, Prompt } from '@sourcegraph/cody-shared'
import { CodyIDE } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import {
    BookOpenIcon,
    BugIcon,
    CombineIcon,
    FileQuestionIcon,
    HammerIcon,
    type LucideIcon,
    MessageCircleCode,
    PencilIcon,
    PlayIcon,
    ShieldCheckIcon,
} from 'lucide-react'
import { type FunctionComponent, useCallback, useState } from 'react'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { useConfig } from '../../utils/useConfig'
import { useDebounce } from '../../utils/useDebounce'
import { Kbd } from '../Kbd'
import { UserAvatar } from '../UserAvatar'
import { Badge } from '../shadcn/ui/badge'
import { Button } from '../shadcn/ui/button'
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandLoading,
    CommandRow,
    CommandSeparator,
} from '../shadcn/ui/command'
import { usePromptsQuery } from './usePromptsQuery'

export type PromptOrDeprecatedCommand =
    | { type: 'prompt'; value: Prompt }
    | { type: 'command'; value: CodyCommand }

type SelectActionLabel = 'insert' | 'run'

/**
 * A list of prompts from the Prompt Library. For backcompat, it also displays built-in commands and
 * custom commands (which are both deprecated in favor of the Prompt Library).
 */
export const PromptList: React.FunctionComponent<{
    IDE: CodyIDE
    onSelect: (item: PromptOrDeprecatedCommand) => void
    onSelectActionLabels?: { prompt: SelectActionLabel; command: SelectActionLabel }
    showSearch?: boolean
    showInitialSelectedItem?: boolean
    showPromptLibraryUnsupportedMessage?: boolean
    showCommandOrigins?: boolean
    className?: string
    commandListClassName?: string
    telemetryLocation: 'ChatTab' | 'PromptsTab'
}> = ({
    IDE,
    onSelect: parentOnSelect,
    onSelectActionLabels,
    showSearch = true,
    showInitialSelectedItem = false,
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
            const codyCommand =
                prompt === undefined
                    ? result?.commands?.find(
                          c => commandRowValue({ type: 'command', value: c }) === rowValue
                      )
                    : undefined
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

    const itemClassName = 'tw-border tw-border-border !tw-rounded-lg !tw-p-4'

    return (
        <Command
            loop={true}
            tabIndex={0}
            className={clsx(
                '!tw-overflow-visible focus:tw-outline-none tw-border-0 !tw-max-w-[unset] tw-w-full !tw-h-[unset] !tw-bg-[unset]',
                className
            )}
            shouldFilter={false}
            // Makes it so that if you hover over a command, it doesn't remain selected after you
            // move your mouse entirely away from the list.
            disablePointerSelection={true}
            defaultValue={showInitialSelectedItem ? undefined : 'xxx-no-item'}
        >
            <CommandList
                className={clsx(
                    '!tw-max-h-[unset] !tw-overflow-visible [&_[cmdk-group]]:tw-pt-0 [&_[cmdk-group-heading]]:tw-flex [&_[cmdk-group-heading]]:tw-gap-2 [&_[cmdk-group-heading]]:tw-items-center [&_[cmdk-group-heading]]:!tw-min-h-[30px] [&_[cmdk-group-heading]]:tw--mx-2 [&_[cmdk-group-heading]]:tw-px-4 [&_[cmdk-group-heading]]:tw-mb-2 [&_[cmdk-group-heading]]:tw-bg-muted [&_[cmdk-group]]:!tw-border-0',
                    commandListClassName
                )}
            >
                {showSearch && (
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Search..."
                        autoFocus={true}
                        wrapperClassName="!tw-border-0 tw-mb-3 tw-px-2"
                        className="!tw-border-border tw-rounded-md focus:!tw-border-ring !tw-py-3"
                    />
                )}
                {result && result.prompts.type !== 'unsupported' && (
                    <CommandGroup className="[&_[cmdk-group-items]]:tw-space-y-4">
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
                                        className={itemClassName}
                                    />
                                ))}
                                {result?.commands?.map(command => (
                                    <CodyCommandItem
                                        key={command.key}
                                        command={command}
                                        onSelect={onSelect}
                                        selectActionLabel={onSelectActionLabels?.command}
                                        showCommandOrigins={showCommandOrigins}
                                        className={itemClassName}
                                    />
                                ))}
                            </>
                        ) : null}
                        {result.prompts.type === 'error' && (
                            <CommandLoading>Error: {result.prompts.error}</CommandLoading>
                        )}
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
                <CommandRow className="tw-items-center tw-justify-center tw-py-2">
                    <Button variant="ghost" size="sm" asChild>
                        <a
                            href={new URL('/prompts', endpointURL).toString()}
                            target="_blank"
                            rel="noreferrer"
                            className="!tw-text-muted-foreground"
                        >
                            Open Prompt Library
                            {IDE === CodyIDE.VSCode && (
                                <Kbd macOS="Opt+Q" linuxAndWindows="Alt+Q" className="tw-ml-2" />
                            )}
                        </a>
                    </Button>
                </CommandRow>
            </CommandList>
        </Command>
    )
}

function commandRowValue(row: PromptOrDeprecatedCommand): string {
    return row.type === 'prompt' ? `prompt-${row.value.id}` : `command-${row.value.key}`
}

const PromptCommandItem: FunctionComponent<{
    prompt: Prompt
    onSelect: (value: string) => void
    selectActionLabel: SelectActionLabel | undefined
    className?: string
}> = ({ prompt, onSelect, selectActionLabel, className }) => (
    <CommandItem
        value={commandRowValue({ type: 'prompt', value: prompt })}
        onSelect={onSelect}
        className={clsx('!tw-items-start tw-overflow-hidden tw-gap-3 tw-group/[cmdk-item]', className)}
    >
        <UserAvatar
            user={{
                username: prompt.owner.namespaceName,
                displayName: prompt.owner.displayName ?? undefined,
            }}
            size={22}
            className="tw-flex-shrink-0 tw-text-xxs"
        />
        <div className="tw-text-nowrap tw-text-ellipsis tw-overflow-hidden">
            <div className="tw-flex tw-text-nowrap tw-gap-3 tw-w-full tw-items-start tw-overflow-hidden">
                <span className="">{prompt.name}</span>
                {prompt.draft && (
                    <Badge variant="secondary" className="tw-text-xxs tw-mt-0.5">
                        Draft
                    </Badge>
                )}
            </div>
            {prompt.description && (
                <span className="tw-text-muted-foreground tw-w-full">{prompt.description}</span>
            )}
        </div>
    </CommandItem>
)

const CodyCommandItem: FunctionComponent<{
    command: CodyCommand
    onSelect: (value: string) => void
    selectActionLabel: SelectActionLabel | undefined
    showCommandOrigins: boolean
    className?: string
}> = ({ command, onSelect, selectActionLabel, showCommandOrigins, className }) => (
    <CommandItem
        value={commandRowValue({ type: 'command', value: command })}
        onSelect={onSelect}
        className={clsx('!tw-items-start tw-overflow-hidden tw-gap-3 tw-group/[cmdk-item]', className)}
    >
        <div className="tw-w-[22px] tw-flex-shrink-0">
            <CommandItemIcon
                command={command}
                size={13}
                className="tw-text-muted-foreground tw-mt-2 tw-mx-auto"
            />
        </div>
        <div className="tw-text-nowrap tw-text-ellipsis tw-overflow-hidden">
            <div className="tw-flex tw-flex-wrap tw-gap-3 tw-w-full tw-items-start">
                <span className="tw-whitespace-nowrap">
                    {command.type === 'default' ? command.description : command.key}
                </span>
                {showCommandOrigins && command.type !== 'default' && (
                    <Badge variant="secondary" className="tw-text-xxs tw-mt-0.5 tw-whitespace-nowrap">
                        Custom Command
                    </Badge>
                )}
            </div>
            {command.type !== 'default' && command.description && (
                <span className="tw-text-xs tw-text-muted-foreground tw-text-nowrap tw-overflow-hidden tw-text-ellipsis tw-w-full">
                    {command.description}
                </span>
            )}
        </div>
    </CommandItem>
)

const CommandItemIcon: FunctionComponent<{ command: CodyCommand; size: number; className?: string }> = ({
    command,
    size,
    className,
}) => {
    const Icon = iconForCommand(command)
    return <Icon size={size} className={className} />
}

function iconForCommand(command: CodyCommand): (typeof ICON_KEYWORDS)[number]['icon'] {
    return ICON_KEYWORDS.find(icon => command.key.toLowerCase().includes(icon.keyword))?.icon ?? PlayIcon
}

const ICON_KEYWORDS: { keyword: string; icon: LucideIcon }[] = [
    { keyword: 'edit', icon: PencilIcon },
    { keyword: 'doc', icon: BookOpenIcon },
    { keyword: 'explain', icon: FileQuestionIcon },
    { keyword: 'test', icon: HammerIcon },
    { keyword: 'fix', icon: BugIcon },
    { keyword: 'debug', icon: BugIcon },
    { keyword: 'secur', icon: ShieldCheckIcon },
    { keyword: 'refactor', icon: CombineIcon },
    { keyword: 'review', icon: MessageCircleCode },
]
