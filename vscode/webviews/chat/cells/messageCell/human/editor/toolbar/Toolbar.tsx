import { type Action, type ChatMessage, type Model, ModelTag } from '@sourcegraph/cody-shared'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import clsx from 'clsx'
import { PaperclipIcon } from 'lucide-react'
import { type FunctionComponent, useCallback } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { ModelSelectField } from '../../../../../../components/modelSelectField/ModelSelectField'
import { PromptSelectField } from '../../../../../../components/promptSelectField/PromptSelectField'
import { ToolbarButton } from '../../../../../../components/shadcn/ui/toolbar'
import toolbarStyles from '../../../../../../components/shadcn/ui/toolbar.module.css'
import { useActionSelect } from '../../../../../../prompts/PromptsTab'
import { getVSCodeAPI } from '../../../../../../utils/VSCodeApi'
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

    const isGoogleModel = useCallback((model: Model) => {
        return model?.tags.includes(ModelTag.BYOK) && model?.id.includes('gemini-2.0-flash')
    }, [])

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
                {isGoogleModel(models[0]) && (
                    <ToolbarButton
                        variant="secondary"
                        tooltip="Upload an image"
                        iconStart={PaperclipIcon}
                        onClick={() => getVSCodeAPI().postMessage({ command: 'chat/upload-image' })}
                        aria-label="Upload image"
                    />
                )}
                {onMentionClick && (
                    <AddContextButton
                        onClick={onMentionClick}
                        className={`tw-opacity-60 focus-visible:tw-opacity-100 hover:tw-opacity-100 tw-mr-2 tw-gap-0.5 ${toolbarStyles.button} ${toolbarStyles.buttonSmallIcon}`}
                    />
                )}
                <PromptSelectFieldToolbarItem focusEditor={focusEditor} className="tw-ml-1 tw-mr-1" />
                <ModelSelectFieldToolbarItem
                    models={models}
                    userInfo={userInfo}
                    focusEditor={focusEditor}
                    className="tw-mr-1"
                />
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
