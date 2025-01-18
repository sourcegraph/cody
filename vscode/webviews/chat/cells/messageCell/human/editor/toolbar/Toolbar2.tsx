import type { Action, ChatMessage, Model } from '@sourcegraph/cody-shared'
import type { OmniboxHandler } from '@sourcegraph/cody-shared/src/models/model'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import clsx from 'clsx'
import { concat } from 'lodash'
import { type FunctionComponent, useCallback, useMemo, useState } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { AgentSelectField } from '../../../../../../components/modelSelectField/AgentSelectField'
import { PromptSelectField } from '../../../../../../components/promptSelectField/PromptSelectField'
import toolbarStyles from '../../../../../../components/shadcn/ui/toolbar.module.css'
import { useActionSelect } from '../../../../../../prompts/PromptsTab'
import { useClientConfig } from '../../../../../../utils/useClientConfig'
import { AddContextButton } from './AddContextButton'
import { SubmitButton, type SubmitButtonState } from './SubmitButton'

/**
 * The toolbar for the human message editor.
 */
export const Toolbar2: FunctionComponent<{
    models: Model[]
    userInfo: UserAccountInfo

    isEditorFocused: boolean

    onMentionClick?: () => void

    onSubmitClick: (intent?: ChatMessage['intent']) => void
    submitState: SubmitButtonState

    /** Handler for clicks that are in the "gap" (dead space), not any toolbar items. */
    onGapClick?: () => void

    focusEditor?: () => void

    hidden?: boolean
    className?: string
    intent?: ChatMessage['intent']
    onSelectIntent?: (intent: ChatMessage['intent']) => void
}> = ({
    userInfo,
    isEditorFocused,
    onMentionClick,
    onSubmitClick,
    submitState,
    onGapClick,
    focusEditor,
    hidden,
    className,
    models,
    intent,
    onSelectIntent,
}) => {
    /**
     * If the user clicks in a gap or on the toolbar outside of any of its buttons, report back to
     * parent via {@link onGapClick}.
     */
    const onMaybeGapClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
            const targetIsToolbarButton = event.target !== event.currentTarget
            if (!targetIsToolbarButton) {
                event.preventDefault()
                event.stopPropagation()
                onGapClick?.()
            }
        },
        [onGapClick]
    )

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas
        <menu
            role="toolbar"
            aria-hidden={hidden}
            hidden={hidden}
            className={clsx(
                'tw-flex tw-items-center tw-justify-between tw-flex-wrap-reverse tw-border-t tw-border-t-border tw-gap-2 [&_>_*]:tw-flex-shrink-0',
                className
            )}
            onMouseDown={onMaybeGapClick}
            onClick={onMaybeGapClick}
            data-testid="chat-editor-toolbar"
        >
            <div className="tw-flex tw-items-center">
                <ModelSelectFieldToolbarItem
                    models={models}
                    userInfo={userInfo}
                    focusEditor={focusEditor}
                    className="tw-mr-1"
                />
                <PromptSelectFieldToolbarItem focusEditor={focusEditor} className="tw-ml-1 tw-mr-1" />
                {/* Can't use tw-gap-1 because the popover creates an empty element when open. */}
                {onMentionClick && (
                    <AddContextButton
                        onClick={onMentionClick}
                        className={`tw-opacity-60 focus-visible:tw-opacity-100 hover:tw-opacity-100 tw-mr-2 tw-gap-0.5 ${toolbarStyles.button} ${toolbarStyles.buttonSmallIcon}`}
                    />
                )}
            </div>
            <div className="tw-flex-1 tw-flex tw-justify-end">
                <SubmitButton
                    onClick={onSubmitClick}
                    isEditorFocused={isEditorFocused}
                    state={submitState}
                    intent={intent}
                    onSelectIntent={onSelectIntent}
                />
            </div>
        </menu>
    )
}

const PromptSelectFieldToolbarItem: FunctionComponent<{
    focusEditor?: () => void
    className?: string
}> = ({ focusEditor, className }) => {
    const runAction = useActionSelect()

    const onSelect = useCallback(
        async (item: Action) => {
            await runAction(item, () => {})
            focusEditor?.()
        },
        [focusEditor, runAction]
    )

    return <PromptSelectField onSelect={onSelect} onCloseByEscape={focusEditor} className={className} />
}

const ModelSelectFieldToolbarItem: FunctionComponent<{
    models: Model[]
    userInfo: UserAccountInfo
    focusEditor?: () => void
    className?: string
}> = ({ userInfo, focusEditor, className, models }) => {
    const clientConfig = useClientConfig()
    const serverSentModelsEnabled = !!clientConfig?.modelsAPIEnabled

    const api = useExtensionAPI()
    const agents = useObservable<OmniboxHandler[]>(useMemo(() => api.agents(), [api.agents])).value ?? []

    // TODO(beyang): this is duplicated state with ChatBuilder.selectedAgent. Either move source of truth to that or move it here.
    const [selectedAgent, setSelectedAgent] = useState<string>(agents[0]?.id ?? undefined)
    const agentList = concat(
        agents.filter(a => a.id === selectedAgent) ?? [],
        agents.filter(a => a.id !== selectedAgent)
    )

    const onModelSelect = useCallback(
        (agent: OmniboxHandler) => {
            setSelectedAgent(agent.id)
            const { model } = agent
            if (model) {
                api.setChatModel(model.id).subscribe({
                    error: error => console.error('setChatModel:', error),
                })
                // KLUDGE(beyang)
                api.setAgent('model').subscribe({
                    error: error => console.error('setAgent:', error),
                })
            } else {
                api.setAgent(agent.id).subscribe({
                    error: error => console.error('setAgent:', error),
                })
            }
            focusEditor?.()
        },
        [focusEditor, api.setChatModel, api.setAgent]
    )

    return (
        !!models?.length &&
        (userInfo.isDotComUser || serverSentModelsEnabled) && (
            <AgentSelectField
                models={agentList}
                onModelSelect={onModelSelect}
                serverSentModelsEnabled={serverSentModelsEnabled}
                userInfo={userInfo}
                onCloseByEscape={focusEditor}
                className={className}
                data-testid="chat-model-selector"
            />
        )
    )
}
