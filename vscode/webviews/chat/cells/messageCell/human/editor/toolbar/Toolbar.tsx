import type { Action, ChatMessage, Model } from '@sourcegraph/cody-shared'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import clsx from 'clsx'
import { FlaskConicalIcon } from 'lucide-react'
import { type FunctionComponent, useCallback } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { ModelSelectField } from '../../../../../../components/modelSelectField/ModelSelectField'
import { PromptSelectField } from '../../../../../../components/promptSelectField/PromptSelectField'
import { Switch } from '../../../../../../components/shadcn/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'
import { useActionSelect } from '../../../../../../prompts/PromptsTab'
import { useConfig } from '../../../../../../utils/useConfig'
import { AddContextButton } from './AddContextButton'
import { SubmitButton, type SubmitButtonState } from './SubmitButton'

/**
 * The toolbar for the human message editor.
 */
export const Toolbar: FunctionComponent<{
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

    /** Deep Cody */
    isDeepCodyEnabled?: boolean
    toggleDeepCody: () => void
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
    isDeepCodyEnabled,
    toggleDeepCody,
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
                {/* Can't use tw-gap-1 because the popover creates an empty element when open. */}
                {onMentionClick && (
                    <AddContextButton
                        onClick={onMentionClick}
                        className="tw-opacity-60 focus-visible:tw-opacity-100 hover:tw-opacity-100 tw-mr-2"
                    />
                )}
                <PromptSelectFieldToolbarItem focusEditor={focusEditor} className="tw-ml-1 tw-mr-1" />
                <ModelSelectFieldToolbarItem
                    models={models}
                    userInfo={userInfo}
                    focusEditor={focusEditor}
                    className="tw-mr-1"
                />
                {/* Currently support Sonnet only */}
                {models?.[0]?.id?.includes('sonnet') && (
                    <DeepCodySwitchToolbarItem
                        isDeepCodyEnabled={isDeepCodyEnabled}
                        toggleDeepCody={toggleDeepCody}
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
    const config = useConfig()

    const api = useExtensionAPI()

    const onModelSelect = useCallback(
        (model: Model) => {
            api.setChatModel(model.id).subscribe({
                error: error => console.error('setChatModel:', error),
            })
            focusEditor?.()
        },
        [api.setChatModel, focusEditor]
    )

    return (
        !!models?.length &&
        (userInfo.isDotComUser || config.configFeatures.serverSentModels) && (
            <ModelSelectField
                models={models}
                onModelSelect={onModelSelect}
                serverSentModelsEnabled={config.configFeatures.serverSentModels}
                userInfo={userInfo}
                onCloseByEscape={focusEditor}
                className={className}
                data-testid="chat-model-selector"
            />
        )
    )
}

const DeepCodySwitchToolbarItem: FunctionComponent<{
    isDeepCodyEnabled?: boolean
    toggleDeepCody: () => void
    className?: string
}> = ({ className, isDeepCodyEnabled, toggleDeepCody }) => {
    if (isDeepCodyEnabled === undefined) {
        return
    }

    const onChange = useCallback(() => {
        toggleDeepCody()
    }, [toggleDeepCody])

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="tw-flex tw-items-center tw-space-x-2 tw-opacity-60 focus-visible:tw-opacity-100 hover:tw-opacity-100 tw-mr-1">
                    <Switch
                        title="Deep Cody"
                        checked={isDeepCodyEnabled}
                        onCheckedChange={onChange}
                        className={className}
                    />
                    <div className="tw-text-sm">
                        <FlaskConicalIcon
                            className="tw-m-0 tw-h-6 tw-w-6 tw-inline-block"
                            strokeWidth={1.5}
                        />
                        Deep Cody
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                [Experimental] Cody may respond slower to fetch additional context for improved output.
            </TooltipContent>
        </Tooltip>
    )
}
