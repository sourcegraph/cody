import classNames from 'classnames'
import { isEqual } from 'lodash'
import { type FunctionComponent, useCallback, useRef, useState } from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import {
    PromptEditor,
    type PromptEditorRefAPI,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
} from '../../../../../promptEditor/PromptEditor'
import { useEnhancedContextEnabled } from '../../../../EnhancedContext'
import styles from './HumanMessageEditor.module.css'
import { SubmitButton } from './SubmitButton'
import { Toolbar } from './Toolbar'

/**
 * A component to compose and edit human chat messages and the settings associated with them.
 */
export const HumanMessageEditor: FunctionComponent<{
    initialEditorState: SerializedPromptEditorState | undefined
    placeholder: string

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void
    userInfo: UserAccountInfo
    className?: string

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = ({
    initialEditorState,
    placeholder,
    isFirstMessage,
    onSubmit,
    userInfo,
    className,
    __storybook__focus,
}) => {
    const editorRef = useRef<PromptEditorRefAPI>(null)

    // The only PromptEditor state we really need to track in our own state is whether it's empty.
    const [isEmptyEditorValue, setIsEmptyEditorValue] = useState(initialEditorState === undefined)
    const [isDirty, setIsDirty] = useState(false)
    const onEditorChange = useCallback(
        (value: SerializedPromptEditorValue): void => {
            setIsEmptyEditorValue(!value?.text?.trim())
            setIsDirty(
                !isEqual(initialEditorState?.lexicalEditorState, value.editorState.lexicalEditorState)
            )
        },
        [initialEditorState]
    )

    const addEnhancedContext = useEnhancedContextEnabled()
    const onSubmitClick = useCallback(() => {
        if (!editorRef.current) {
            throw new Error('No editorRef')
        }
        onSubmit(editorRef.current.getSerializedValue(), addEnhancedContext)
    }, [onSubmit, addEnhancedContext])

    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) when input is not empty.
            if (event && !event.shiftKey && !event.isComposing && !isEmptyEditorValue) {
                event.preventDefault()
                onSubmitClick()
                return
            }
        },
        [isEmptyEditorValue, onSubmitClick]
    )

    const [isEditorFocused, setIsEditorFocused] = useState(false)
    const onEditorFocusChange = useCallback((focused: boolean): void => {
        setIsEditorFocused(focused)
        // TODO(sqs): close all toolbar dropdowns
    }, [])

    // If the user clicks in a gap or on the toolbar outside of any of its buttons, pass through to
    // focus the editor.
    const onGapClick = useCallback((event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        const targetIsToolbarButton = event.target !== event.currentTarget
        if (!targetIsToolbarButton) {
            event.preventDefault()
            event.stopPropagation()
            editorRef.current?.setFocus(true, true)
        }
    }, [])

    const [isHovered, setIsHovered] = useState(false)
    const onMouseEnter = useCallback(() => setIsHovered(true), [])
    const onMouseLeave = useCallback(() => setIsHovered(false), [])

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas
        <div
            className={classNames(
                styles.container,
                {
                    [styles.firstMessage]: isFirstMessage,
                    [styles.focused]: isEditorFocused || __storybook__focus,
                },
                className
            )}
            onMouseDown={onGapClick}
            onClick={onGapClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <PromptEditor
                contentEditableClassName={styles.editorContentEditable}
                seamless={true}
                placeholder={placeholder}
                initialEditorState={initialEditorState}
                onChange={onEditorChange}
                onFocusChange={onEditorFocusChange}
                onEnterKey={onEditorEnterKey}
                editorRef={editorRef}
            />
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas */}
            <div className={styles.toolbar} onMouseDown={onGapClick} onClick={onGapClick}>
                <Toolbar userInfo={userInfo} setEditorFocus={editorRef.current?.setFocus} />
                <div className={styles.spacer} />
                <SubmitButton
                    onClick={onSubmitClick}
                    isEditorFocused={isEditorFocused}
                    isParentHovered={isHovered}
                    disabled={isEmptyEditorValue}
                />
            </div>
        </div>
    )
}

// TODO!(sqs): make <return> submit, <ctrl>+<return> newline
