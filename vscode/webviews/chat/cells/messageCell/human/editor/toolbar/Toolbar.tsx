import type { ModelProvider } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { AtSignIcon } from 'lucide-react'
import { type FunctionComponent, useCallback } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { EnhancedContextSettings } from '../../../../../../components/EnhancedContextSettings'
import { ModelSelectField } from '../../../../../../components/modelSelectField/ModelSelectField'
import { ToolbarButton } from '../../../../../../components/shadcn/ui/toolbar'
import { useChatModelContext } from '../../../../../models/chatModelContext'
import { SubmitButton } from './SubmitButton'
import styles from './Toolbar.module.css'

/**
 * The toolbar for the human message editor.
 */
export const Toolbar: FunctionComponent<{
    userInfo: UserAccountInfo

    isEditorFocused: boolean

    /** Whether this editor is for a message whose assistant response is in progress. */
    isPendingResponse: boolean

    onMentionClick?: () => void

    onSubmitClick: (withEnhancedContext: boolean) => void
    submitDisabled: boolean

    /** Handler for clicks that are in the "gap" (dead space), not any toolbar items. */
    onGapClick?: () => void

    focusEditor?: () => void

    hidden?: boolean
    className?: string
}> = ({
    userInfo,
    isEditorFocused,
    isPendingResponse,
    onMentionClick,
    onSubmitClick,
    submitDisabled,
    onGapClick,
    focusEditor,
    hidden,
    className,
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
            className={clsx(styles.container, className)}
            onMouseDown={onMaybeGapClick}
            onClick={onMaybeGapClick}
        >
            {onMentionClick && (
                <ToolbarButton
                    variant="secondary"
                    tooltip="Add files and other context"
                    iconStart={AtSignIcon}
                    onClick={onMentionClick}
                    aria-label="Add context"
                />
            )}
            <EnhancedContextSettings
                presentationMode={userInfo.isDotComUser ? 'consumer' : 'enterprise'}
                onCloseByEscape={focusEditor}
            />
            <ModelSelectFieldToolbarItem userInfo={userInfo} focusEditor={focusEditor} />
            <div className={styles.spacer} />
            <SubmitButton
                onClick={onSubmitClick}
                isEditorFocused={isEditorFocused}
                isPendingResponse={isPendingResponse}
                disabled={submitDisabled}
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
        (model: ModelProvider) => {
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
