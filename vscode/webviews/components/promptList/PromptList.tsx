import type { View } from '@/tabs'
import type { CodyCommand, Prompt } from '@sourcegraph/cody-shared'
import type { LucideProps } from 'lucide-react'
import { type ComponentProps, type ForwardRefExoticComponent, type FunctionComponent, useCallback, useState } from 'react'
import { useClientActionDispatcher } from '../../client/clientState'
import { usePromptsQuery } from '../../components/promptList/usePromptsQuery'
import { onPromptSelectInPanel } from '../../prompts/PromptsTab'
import { useDebounce } from '../../utils/useDebounce'
import PromptBox, { type PromptBoxProps } from '../../chat/components/PromptBox'
import styles from './PromptList.module.css'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { useConfig } from '../../utils/useConfig'
import clsx from 'clsx'
import { commandRowValue, createPromptOrDeprecatedCommandArray } from './utils'

export type PromptOrDeprecatedCommand =
    | {
        type: 'prompt';
        value: Prompt;
        icon?: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
    } | {
        type: 'command';
        value: CodyCommand
        icon?: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
    }

export type SelectActionLabel = 'insert' | 'run'

interface PromptListProps {
    onSelect: (item: PromptOrDeprecatedCommand) => void
    setView: (view: View) => void
    onSelectActionLabels?: { prompt: SelectActionLabel; command: SelectActionLabel }
    showSearch?: boolean
    showOnlyPromptInsertableCommands?: boolean
    showInitialSelectedItem?: boolean
    showPromptLibraryUnsupportedMessage?: boolean
    showCommandOrigins?: boolean
    className?: string
    commandListClassName?: string
    telemetryLocation: 'PromptSelectField' | 'PromptsTab'
}



export function PromptList({
    onSelect: parentOnSelect,
    setView,
    onSelectActionLabels,
    // showSearch = true,
    showOnlyPromptInsertableCommands,
    showInitialSelectedItem = true,
    showPromptLibraryUnsupportedMessage = true,
    showCommandOrigins = false,
    className,
    // commandListClassName,
    telemetryLocation,
}: PromptListProps) {
    const telemetryRecorder = useTelemetryRecorder()
    const telemetryPublicMetadata: Record<string, number> = {
        [`in${telemetryLocation}`]: 1,
    }

    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 250)
    const { value: result, error } = usePromptsQuery(debouncedQuery)
    const promptsType = result?.prompts.type
    const commands: CodyCommand[] = result?.commands ?? []
    const prompts: Prompt[] = (result && promptsType === 'results') ? result?.prompts.results : []
    const customPrompts: PromptOrDeprecatedCommand[] = createPromptOrDeprecatedCommandArray(prompts, commands)
    const dispatchClientAction = useClientActionDispatcher()

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
            telemetryPublicMetadata,
            parentOnSelect,
            debouncedQuery,
            error,
        ]
    )

    const extractPromptsForPromptBox = (prompts: PromptOrDeprecatedCommand[]) => {
        const promptBoxPrompts: PromptBoxProps[] = []
        for (const prompt of prompts) {
            promptBoxPrompts.push({
                prompt: prompt,
                onSelect: () => {
                    onPromptSelectInPanel(
                        prompt,
                        setView,
                        dispatchClientAction
                    )
                },
                icon: prompt.icon,
            })
        }
        return promptBoxPrompts
    }

    const displayPrompts = () => {
        if (error) {
            console.error(
                'An error occurred while fetching prompts:\n',
                error.message + '\n',
                error.stack ?? ''
            )
            return <div>{error.message}</div>
        }

        const userPrompts = extractPromptsForPromptBox(customPrompts)
        // const defaultPrompts = extractPromptsForPromptBox(standardPrompts)
        // Order may be important here so this might not work.
        // const prompts = userPrompts.slice(0, 4).concat(defaultPrompts)

        return userPrompts.map((p, i) => {
            return (
                <PromptBox
                    key={`promptOrCommand-${i + 1}`}
                    prompt={p.prompt}
                    icon={p.icon ?? undefined}
                    onSelect={p.onSelect}
                />
            )
        })
    }

    const endpointURL = new URL(useConfig().authStatus.endpoint)
    // Don't show builtin commands to insert in the prompt editor.
    const filteredCommands = showOnlyPromptInsertableCommands
        ? result?.commands.filter(c => c.type !== 'default')
        : result?.commands


    return <div className={styles.prompts}>{displayPrompts()}</div>
}

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
