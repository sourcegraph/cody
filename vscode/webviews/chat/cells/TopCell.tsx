import type { ChatMessage, ContextItem, Model, ProcessingStep } from '@sourcegraph/cody-shared'
import { BrainIcon, Loader2Icon } from 'lucide-react'
import { type FC, memo, useCallback, useState } from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../../components/shadcn/ui/accordion'
import { Cell } from './Cell'
import { AgenticChatCell } from './agenticCell/AgenticContextCell'
import { ContextCell, EditContextButtonChat, EditContextButtonSearch } from './contextCell/ContextCell'
import { NON_HUMAN_CELL_AVATAR_SIZE } from './messageCell/assistant/AssistantMessageCell'

export const TopCell: FC<{
    isContextLoading: boolean
    contextItems: ContextItem[] | undefined
    processes?: ProcessingStep[]
    agent?: string
    intent: ChatMessage['intent']
    model?: Model['id']
    isForFirstMessage: boolean
    experimentalOneBoxEnabled?: boolean
    resubmitWithRepoContext?: () => Promise<void>
    onManuallyEditContext: () => void
    className?: string
}> = memo(
    ({
        isContextLoading,
        contextItems,
        processes,
        agent,
        intent,
        model,
        isForFirstMessage,
        experimentalOneBoxEnabled,
        resubmitWithRepoContext,
        onManuallyEditContext,
        className,
    }) => {
        const [accordionValue, setAccordionValue] = useState<string | undefined>(undefined)

        const triggerAccordion = useCallback(() => {
            setAccordionValue(prev => (prev ? '' : 'main-cell'))
        }, [])

        const isSearchIntent = experimentalOneBoxEnabled && intent === 'search'

        return (
            <Accordion
                type="single"
                collapsible={true}
                defaultValue={undefined}
                asChild={true}
                value={accordionValue}
            >
                <AccordionItem value="main-cell" asChild>
                    <Cell
                        header={
                            <AccordionTrigger
                                onClick={triggerAccordion}
                                title="Context and Processing"
                                className="tw-flex tw-items-center tw-gap-4"
                                disabled={!processes?.some(p => p.id) && !contextItems}
                            >
                                {isContextLoading ? (
                                    <Loader2Icon
                                        size={NON_HUMAN_CELL_AVATAR_SIZE}
                                        className="tw-animate-spin"
                                    />
                                ) : (
                                    <BrainIcon
                                        size={NON_HUMAN_CELL_AVATAR_SIZE}
                                        className="tw-text-green-500"
                                    />
                                )}
                                <span className="tw-flex tw-items-baseline">
                                    Context and Process
                                    <span className="tw-opacity-60 tw-text-sm tw-ml-2">
                                        &mdash; {isContextLoading ? 'analyzing...' : 'complete'}
                                    </span>
                                </span>
                            </AccordionTrigger>
                        }
                        containerClassName={className}
                        contentClassName="tw-flex tw-flex-col tw-max-w-full"
                    >
                        <AccordionContent
                            className="tw-ml-6 tw-flex tw-flex-col tw-gap-2 tw-mt-2"
                            overflow={false}
                        >
                            {processes && (
                                <AgenticChatCell
                                    isContextLoading={isContextLoading}
                                    processes={processes}
                                />
                            )}
                            {!(agent && isContextLoading) &&
                                (contextItems || isContextLoading) &&
                                !isSearchIntent && (
                                    <ContextCell
                                        experimentalOneBoxEnabled={experimentalOneBoxEnabled}
                                        intent={intent}
                                        resubmitWithRepoContext={resubmitWithRepoContext}
                                        contextItems={contextItems}
                                        model={model}
                                        isForFirstMessage={isForFirstMessage}
                                        isContextLoading={isContextLoading}
                                        onManuallyEditContext={onManuallyEditContext}
                                        editContextNode={
                                            intent === 'search'
                                                ? EditContextButtonSearch
                                                : EditContextButtonChat
                                        }
                                        defaultOpen={isContextLoading && agent === 'deep-cody'}
                                        agent={agent}
                                    />
                                )}
                        </AccordionContent>
                    </Cell>
                </AccordionItem>
            </Accordion>
        )
    }
)
