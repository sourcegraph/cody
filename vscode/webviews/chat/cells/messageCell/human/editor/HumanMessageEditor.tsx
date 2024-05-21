import type { ContextItem } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { type FunctionComponent, useCallback, useEffect, useRef, useState } from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import {
    PromptEditor,
    type PromptEditorRefAPI,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
} from '../../../../../promptEditor/PromptEditor'
import { useEnhancedContextEnabled } from '../../../../EnhancedContext'
import styles from './HumanMessageEditor.module.css'
import { Toolbar } from './toolbar/Toolbar'

/**
 * A component to compose and edit human chat messages and the settings associated with them.
 */
export const HumanMessageEditor: FunctionComponent<{
    userInfo: UserAccountInfo
    isNewInstall?: boolean
    userContextFromSelection?: ContextItem[]

    initialEditorState: SerializedPromptEditorState | undefined
    placeholder: string

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    /** Whether this editor is for a message that has been sent already. */
    isSent: boolean

    disabled?: boolean

    onChange?: (editorState: SerializedPromptEditorValue) => void
    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void

    isEditorInitiallyFocused?: boolean
    className?: string

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = ({
    userInfo,
    isNewInstall,
    userContextFromSelection,
    initialEditorState,
    placeholder,
    isFirstMessage,
    isSent,
    disabled = false,
    onChange,
    onSubmit,
    isEditorInitiallyFocused,
    className,
    __storybook__focus,
}) => {
    const editorRef = useRef<PromptEditorRefAPI>(null)

    // The only PromptEditor state we really need to track in our own state is whether it's empty.
    const [isEmptyEditorValue, setIsEmptyEditorValue] = useState(initialEditorState === undefined)
    const onEditorChange = useCallback(
        (value: SerializedPromptEditorValue): void => {
            onChange?.(value)
            setIsEmptyEditorValue(!value?.text?.trim())
        },
        [onChange]
    )

    const addEnhancedContext = useEnhancedContextEnabled()
    const onSubmitClick = useCallback(
        (withEnhancedContext: boolean) => {
            if (!editorRef.current) {
                throw new Error('No editorRef')
            }
            onSubmit(editorRef.current.getSerializedValue(), addEnhancedContext && withEnhancedContext)
        },
        [onSubmit, addEnhancedContext]
    )

    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) when input is not empty.
            if (event && !event.shiftKey && !event.isComposing && !isEmptyEditorValue) {
                event.preventDefault()
                onSubmitClick(true)
                return
            }
        },
        [isEmptyEditorValue, onSubmitClick]
    )

    const [isEditorFocused, setIsEditorFocused] = useState(false)
    const onEditorFocusChange = useCallback((focused: boolean): void => {
        setIsEditorFocused(focused)
    }, [])

    const [isFocusWithin, setIsFocusWithin] = useState(false)
    const onFocus = useCallback(() => {
        setIsFocusWithin(true)
    }, [])
    const onBlur = useCallback(() => {
        setIsFocusWithin(false)
    }, [])

    useEffect(() => {
        if (isEditorInitiallyFocused) {
            // Only focus the editor if the user hasn't made another selection or has scrolled down.
            // It would be annoying if we clobber the user's intentional selection or scrolling
            // choice with the autofocus.
            const selection = window.getSelection()
            const userHasIntentionalSelection = selection && !selection.isCollapsed
            const userHasIntentionalScroll = window.scrollY !== 0
            if (!userHasIntentionalSelection && !userHasIntentionalScroll) {
                editorRef.current?.setFocus(true, true)
            }
        }
    }, [isEditorInitiallyFocused])

    /**
     * If the user clicks in a gap, focus the editor so that the whole component "feels" like an input field.
     */
    const onGapClick = useCallback(() => {
        editorRef.current?.setFocus(true, true)
    }, [])
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

    const [isHovered, setIsHovered] = useState(false)
    const onMouseEnter = useCallback(() => setIsHovered(true), [])
    const onMouseLeave = useCallback(() => setIsHovered(false), [])

    const onMentionClick = useCallback((): void => {
        if (!editorRef.current) {
            throw new Error('No editorRef')
        }
        editorRef.current.appendText('@', true)
    }, [])

    // Set up the message listener for adding new context from user's editor to chat from the "Cody
    // > Add Selection to Cody Chat" command.
    useEffect(() => {
        if (!userContextFromSelection || userContextFromSelection.length === 0) {
            return
        }
        const editor = editorRef.current
        if (editor && isFirstMessage) {
            editorRef.current?.addContextItemAsToken(userContextFromSelection)
        }
    }, [userContextFromSelection, isFirstMessage])

    const focusEditor = useCallback(() => editorRef.current?.setFocus(true), [])

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas
        <div
            className={clsx(
                styles.container,
                {
                    [styles.sent]: isSent,
                    [styles.focused]: isEditorFocused || isFocusWithin || __storybook__focus,
                },
                className
            )}
            onMouseDown={onMaybeGapClick}
            onClick={onMaybeGapClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onFocus={onFocus}
            onBlur={onBlur}
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
                disabled={disabled}
            />
            {!disabled && (
                <Toolbar
                    userInfo={userInfo}
                    isNewInstall={isNewInstall}
                    isEditorFocused={isEditorFocused || isFocusWithin}
                    isParentHovered={isHovered}
                    onMentionClick={onMentionClick}
                    onSubmitClick={onSubmitClick}
                    submitDisabled={isEmptyEditorValue}
                    onGapClick={onGapClick}
                    focusEditor={focusEditor}
                    className={styles.toolbar}
                />
            )}
        </div>
    )
}
