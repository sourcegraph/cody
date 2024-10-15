import clsx from 'clsx'
import { type FC, useCallback, useState } from 'react'

import type { Action } from '@sourcegraph/cody-shared'

import { useTelemetryRecorder } from '../../utils/telemetry'
import { useConfig } from '../../utils/useConfig'
import { useDebounce } from '../../utils/useDebounce'
import {
    Command,
    CommandInput,
    CommandList,
    CommandLoading,
    CommandSeparator,
} from '../shadcn/ui/command'
import { ActionItem } from './ActionItem'
import { usePromptsQuery } from './usePromptsQuery'
import { commandRowValue } from './utils'

import { useLocalStorage } from '../../components/hooks'
import styles from './PromptList.module.css'

interface PromptListProps {
    showSearch: boolean
    showFirstNItems?: number
    telemetryLocation: 'PromptSelectField' | 'PromptsTab'
    showOnlyPromptInsertableCommands?: boolean
    showInitialSelectedItem?: boolean
    showCommandOrigins?: boolean
    showPromptLibraryUnsupportedMessage?: boolean
    className?: string
    inputClassName?: string
    paddingLevels?: 'none' | 'middle' | 'big'
    appearanceMode?: 'flat-list' | 'chips-list'
    lastUsedSorting?: boolean
    includeEditCommandOnTop?: boolean
    onSelect: (item: Action) => void
}

/**
 * A list of prompts from the Prompt Library. For backcompat, it also displays built-in commands and
 * custom commands (which are both deprecated in favor of the Prompt Library).
 *
 * It is used in the {@link PromptSelectField} in a popover and in {@link PromptsTab} as a list (not
 * in a popover).
 */
export const PromptList: FC<PromptListProps> = props => {
    const {
        showSearch,
        showFirstNItems,
        telemetryLocation,
        showOnlyPromptInsertableCommands,
        showInitialSelectedItem = true,
        showPromptLibraryUnsupportedMessage = true,
        className,
        inputClassName,
        paddingLevels = 'none',
        appearanceMode = 'flat-list',
        lastUsedSorting,
        includeEditCommandOnTop,
        onSelect: parentOnSelect,
    } = props

    const endpointURL = new URL(useConfig().authStatus.endpoint)
    const telemetryRecorder = useTelemetryRecorder()
    const [lastUsedActions = {}] = useLocalStorage<Record<string, number>>('last-used-actions-v2', {})

    const telemetryPublicMetadata: Record<string, number> = {
        [`in${telemetryLocation}`]: 1,
    }

    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 250)
    const { value: result, error } = usePromptsQuery(debouncedQuery)

    const onSelect = useCallback(
        (rowValue: string): void => {
            const action = result?.actions.find(p => commandRowValue(p) === rowValue)

            if (!action || !result) {
                return
            }

            const isPrompt = action.actionType === 'prompt'
            const isCommand = action.actionType === 'command'
            const isBuiltInCommand = isCommand && action.type === 'default'

            telemetryRecorder.recordEvent('cody.promptList', 'select', {
                metadata: {
                    isPrompt: isPrompt ? 1 : 0,
                    isCommand: isCommand ? 1 : 0,
                    isCommandBuiltin: isBuiltInCommand ? 1 : 0,
                    isCommandCustom: !isBuiltInCommand ? 1 : 0,
                    ...telemetryPublicMetadata,
                },
                privateMetadata: {
                    nameWithOwner: isPrompt ? action.nameWithOwner : undefined,
                },
            })

            const prompts = result.actions.filter(action => action.actionType === 'prompt')
            const commands = result.actions.filter(action => action.actionType === 'command')

            telemetryRecorder.recordEvent('cody.promptList', 'query', {
                metadata: {
                    queryLength: debouncedQuery.length,
                    resultCount: result.actions.length,
                    resultCountPromptsOnly: prompts.length,
                    resultCountCommandsOnly: commands.length,
                    hasUsePromptsQueryError: error ? 1 : 0,
                    supportsPrompts: 1,
                    hasPromptsResultError: 0,
                    ...telemetryPublicMetadata,
                },
                privateMetadata: {
                    query: debouncedQuery,
                    usePromptsQueryErrorMessage: error?.message,
                },
            })

            parentOnSelect(action)
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

    // Don't show builtin commands to insert in the prompt editor.
    const allActions = showOnlyPromptInsertableCommands
        ? result?.actions.filter(action => action.actionType === 'prompt' || action.mode === 'ask') ?? []
        : result?.actions ?? []

    const sortedActions = lastUsedSorting ? getSortedActions(allActions, lastUsedActions) : allActions

    const editCommandIndex = sortedActions.findIndex(
        action => action.actionType === 'command' && action.key === 'edit'
    )

    // Bring Edit command on top of the command list
    if (includeEditCommandOnTop && editCommandIndex !== -1) {
        sortedActions.unshift(sortedActions.splice(editCommandIndex, 1)[0])
    }

    const actions = showFirstNItems ? sortedActions.slice(0, showFirstNItems) : sortedActions

    const inputPaddingClass =
        paddingLevels !== 'none' ? (paddingLevels === 'middle' ? '!tw-p-2' : '!tw-p-4') : ''

    const itemPaddingClass =
        paddingLevels !== 'none' ? (paddingLevels === 'middle' ? '!tw-px-6' : '!tw-px-8') : ''

    return (
        <Command
            loop={true}
            tabIndex={0}
            shouldFilter={false}
            defaultValue={showInitialSelectedItem ? undefined : 'xxx-no-item'}
            className={clsx(styles.list, { [styles.listChips]: appearanceMode === 'chips-list' })}
        >
            <CommandList className={className}>
                {showSearch && (
                    <div className={clsx(inputPaddingClass, inputClassName, styles.listInputContainer)}>
                        <CommandInput
                            value={query}
                            onValueChange={setQuery}
                            placeholder="Search..."
                            autoFocus={true}
                            className={styles.listInput}
                        />
                    </div>
                )}

                {!result && !error && (
                    <CommandLoading className={itemPaddingClass}>Loading...</CommandLoading>
                )}
                {result && allActions.filter(action => action.actionType === 'prompt').length === 0 && (
                    <CommandLoading className={itemPaddingClass}>
                        {result?.query === '' ? (
                            <>
                                Your Prompt Library is empty.{' '}
                                <a
                                    href={new URL('/prompts/new', endpointURL).toString()}
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

                {actions.map(action => (
                    <ActionItem
                        key={commandRowValue(action)}
                        action={action}
                        onSelect={onSelect}
                        className={clsx(itemPaddingClass, styles.listItem)}
                    />
                ))}

                {showPromptLibraryUnsupportedMessage && result && !result.arePromptsSupported && (
                    <>
                        <CommandSeparator alwaysRender={true} />
                        <CommandLoading className="tw-px-4">
                            Prompt Library is not yet available on {endpointURL.hostname}. Ask your site
                            admin to upgrade to Sourcegraph 5.6 or later.
                        </CommandLoading>
                    </>
                )}

                {error && (
                    <CommandLoading className="tw-px-4">
                        Error: {error.message || 'unknown'}
                    </CommandLoading>
                )}
            </CommandList>
        </Command>
    )
}

function getSortedActions(actions: Action[], lastUsedActions: Record<string, number>): Action[] {
    return [...actions].sort((action1, action2) => {
        const action1Key = action1.actionType === 'prompt' ? action1.id : action1.key
        const action2Key = action2.actionType === 'prompt' ? action2.id : action2.key
        const action1Count = lastUsedActions[action1Key] ?? 0
        const action2Count = lastUsedActions[action2Key] ?? 0

        return action2Count - action1Count
    })
}
