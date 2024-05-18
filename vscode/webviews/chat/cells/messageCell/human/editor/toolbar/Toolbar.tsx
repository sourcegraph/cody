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
    isNewInstall?: boolean

    isEditorFocused: boolean

    isParentHovered: boolean

    onMentionClick?: () => void

    onSubmitClick: (withEnhancedContext: boolean) => void
    submitDisabled: boolean

    /** Handler for clicks that are in the "gap" (dead space), not any toolbar items. */
    onGapClick?: () => void

    focusEditor?: () => void

    className?: string
}> = ({
    userInfo,
    isNewInstall,
    isEditorFocused,
    isParentHovered,
    onMentionClick,
    onSubmitClick,
    submitDisabled,
    onGapClick,
    focusEditor,
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
                    tabIndex={-1} // type '@' to invoke, doesn't need to be tabbable
                />
            )}
            <EnhancedContextSettings
                defaultOpen={isNewInstall}
                presentationMode={userInfo.isDotComUser ? 'consumer' : 'enterprise'}
                onCloseByEscape={focusEditor}
            />
            <ModelSelectFieldToolbarItem userInfo={userInfo} onCloseByEscape={focusEditor} />
            <div className={styles.spacer} />
            <SubmitButton
                onClick={onSubmitClick}
                isEditorFocused={isEditorFocused}
                isParentHovered={isParentHovered}
                disabled={submitDisabled}
            />
        </menu>
    )
}

const ModelSelectFieldToolbarItem: FunctionComponent<{
    userInfo: UserAccountInfo
    onCloseByEscape?: () => void
}> = ({ userInfo, onCloseByEscape }) => {
    const { chatModels, onCurrentChatModelChange } = useChatModelContext()

    return (
        !!chatModels?.length &&
        onCurrentChatModelChange &&
        userInfo &&
        userInfo.isDotComUser && (
            <ModelSelectField
                models={chatModels}
                onModelSelect={onCurrentChatModelChange}
                userInfo={userInfo}
                align="start"
                onCloseByEscape={onCloseByEscape}
            />
        )
    )
}
