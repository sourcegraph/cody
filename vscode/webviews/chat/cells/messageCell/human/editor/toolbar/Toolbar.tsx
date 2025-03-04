import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import {
    type Action,
    type ChatMessage,
    type ContextItemMedia,
    type Model,
    ModelTag,
} from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { type FunctionComponent, useCallback, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { PromptSelectField } from '../../../../../../components/promptSelectField/PromptSelectField'
import toolbarStyles from '../../../../../../components/shadcn/ui/toolbar.module.css'
import { useActionSelect } from '../../../../../../prompts/PromptsTab'
import { MediaUploadButton } from './MediaUploadButton'
import { ModeSelectorField } from './ModeSelectorButton'
import { SubmitButton, type SubmitButtonState } from './SubmitButton'

/**
 * The toolbar for the human message editor.
 */
export const Toolbar: FunctionComponent<{
    models: Model[]
    userInfo: UserAccountInfo

    isEditorFocused: boolean

    onSubmitClick: (intent?: ChatMessage['intent']) => void
    submitState: SubmitButtonState

    /** Handler for clicks that are in the "gap" (dead space), not any toolbar items. */
    onGapClick?: () => void

    focusEditor?: () => void

    hidden?: boolean
    className?: string

    intent?: ChatMessage['intent']
    manuallySelectIntent: (intent: ChatMessage['intent']) => void

    extensionAPI: WebviewToExtensionAPI

    omniBoxEnabled: boolean
    onMediaUpload?: (mediaContextItem: ContextItemMedia) => void
}> = ({
    userInfo,
    isEditorFocused,
    onSubmitClick,
    submitState,
    onGapClick,
    focusEditor,
    hidden,
    className,
    models,
    intent,
    manuallySelectIntent,
    extensionAPI,
    omniBoxEnabled,
    onMediaUpload,
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

    /**
     * Image upload is enabled if the user is not on Sourcegraph.com,
     * or is using a BYOK model with vision tag.
     */
    const isImageUploadEnabled = useMemo(() => {
        const isDotCom = userInfo?.isDotComUser
        const selectedModel = models?.[0]
        const isBYOK = selectedModel?.tags?.includes(ModelTag.BYOK)
        const isVision = selectedModel?.tags?.includes(ModelTag.Vision)
        return (!isDotCom || isBYOK) && isVision
    }, [userInfo?.isDotComUser, models?.[0]])

    if (models?.length < 2) {
        return null
    }

    return (
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
            onKeyDown={() => null}
            data-testid="chat-editor-toolbar"
        >
            <div className="tw-flex tw-items-center">
                {onMediaUpload && isImageUploadEnabled && (
                    <MediaUploadButton
                        onMediaUpload={onMediaUpload}
                        isEditorFocused={isEditorFocused}
                        submitState={submitState}
                        className={`tw-opacity-60 focus-visible:tw-opacity-100 hover:tw-opacity-100 tw-mr-2 tw-gap-0.5 ${toolbarStyles.button} ${toolbarStyles.buttonSmallIcon}`}
                    />
                )}
                <PromptSelectFieldToolbarItem focusEditor={focusEditor} className="tw-ml-1 tw-mr-1" />
                {!userInfo?.isDotComUser && omniBoxEnabled && (
                    <ModeSelectorField
                        className={className}
                        omniBoxEnabled={omniBoxEnabled}
                        intent={intent}
                        isDotComUser={userInfo?.isDotComUser}
                        manuallySelectIntent={manuallySelectIntent}
                    />
                )}
            </div>
            <div className="tw-flex-1 tw-flex tw-justify-end">
                <SubmitButton onClick={onSubmitClick} state={submitState} />
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
