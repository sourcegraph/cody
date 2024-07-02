import { type Model, ModelsService } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { type FunctionComponent, useCallback } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { ModelSelectField } from '../../../../../../components/modelSelectField/ModelSelectField'
import { useChatModelContext } from '../../../../../models/chatModelContext'
import { AddContextButton } from './AddContextButton'
import { SubmitButton, type SubmitButtonState } from './SubmitButton'
import { UploadImageButton } from './UploadImageButton'

/**
 * The toolbar for the human message editor.
 */
export const Toolbar: FunctionComponent<{
    userInfo: UserAccountInfo

    isEditorFocused: boolean

    onMentionClick?: () => void

    onSubmitClick: () => void
    submitState: SubmitButtonState

    /** Handler for clicks that are in the "gap" (dead space), not any toolbar items. */
    onGapClick?: () => void

    focusEditor?: () => void

    hidden?: boolean
    className?: string

    imageFile?: File
    setImageFile: (file: File | undefined) => void
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
    imageFile,
    setImageFile,
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

    const { chatModels } = useChatModelContext()
    const currentModel = chatModels?.find(m => m.default)
    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas
        <menu
            role="toolbar"
            aria-hidden={hidden}
            hidden={hidden}
            className={clsx('tw-flex tw-items-center', className)}
            onMouseDown={onMaybeGapClick}
            onClick={onMaybeGapClick}
        >
            <div className="tw-flex tw-gap-1 tw-items-center">
                {onMentionClick && (
                    <AddContextButton onClick={onMentionClick} className="tw-opacity-60" />
                )}
                {currentModel && ModelsService.isMultiModalModel(currentModel?.model) && (
                    // todo(tim): add support for passing in chatModel.images[0] if present (and make onClick remove it)
                    <UploadImageButton
                        className="tw-opacity-60"
                        imageFile={imageFile}
                        onClick={setImageFile}
                    />
                )}
                <span>
                    <ModelSelectFieldToolbarItem userInfo={userInfo} focusEditor={focusEditor} />
                </span>
            </div>
            <div className="tw-flex-1" />
            <SubmitButton
                onClick={onSubmitClick}
                isEditorFocused={isEditorFocused}
                state={submitState}
            />
        </menu>
    )
}

const ModelSelectFieldToolbarItem: FunctionComponent<{
    userInfo: UserAccountInfo
    focusEditor?: () => void
    className?: string
}> = ({ userInfo, focusEditor, className }) => {
    const { chatModels, onCurrentChatModelChange } = useChatModelContext()

    const onModelSelect = useCallback(
        (model: Model) => {
            onCurrentChatModelChange?.(model)
            focusEditor?.()
        },
        [onCurrentChatModelChange, focusEditor]
    )

    return (
        !!chatModels?.length &&
        onCurrentChatModelChange &&
        userInfo &&
        userInfo.isDotComUser && (
            <ModelSelectField
                models={chatModels}
                onModelSelect={onModelSelect}
                userInfo={userInfo}
                onCloseByEscape={focusEditor}
                className={className}
            />
        )
    )
}
