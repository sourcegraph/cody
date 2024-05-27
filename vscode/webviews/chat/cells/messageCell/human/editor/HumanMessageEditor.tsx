import type { ContextItem } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import {
    type FocusEventHandler,
    type FunctionComponent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import {
    PromptEditor,
    type PromptEditorRefAPI,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
} from '../../../../../promptEditor/PromptEditor'
import styles from './HumanMessageEditor.module.css'
import type { SubmitButtonDisabled } from './toolbar/SubmitButton'
import { Toolbar } from './toolbar/Toolbar'

/**
 * A component to compose and edit human chat messages and the settings associated with them.
 */
export const HumanMessageEditor: FunctionComponent<{
    userInfo: UserAccountInfo
    userContextFromSelection?: ContextItem[]

    initialEditorState: SerializedPromptEditorState | undefined
    placeholder: string

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    /** Whether this editor is for a message that has been sent already. */
    isSent: boolean

    /** Whether this editor is for a message whose assistant response is in progress. */
    isPendingResponse: boolean

    /** Whether this editor is for a followup message to a still-in-progress assistant response. */
    isPendingPriorResponse: boolean

    disabled?: boolean

    onChange?: (editorState: SerializedPromptEditorValue) => void
    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void

    isEditorInitiallyFocused?: boolean
    className?: string

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = ({
    userInfo,
    userContextFromSelection,
    initialEditorState,
    placeholder,
    isFirstMessage,
    isSent,
    isPendingResponse,
    isPendingPriorResponse,
    disabled = false,
    onChange,
    onSubmit,
    isEditorInitiallyFocused,
    className,
    __storybook__focus,
}) => {
    const editorRef = useRef<PromptEditorRefAPI>(null)

    // The only PromptEditor state we really need to track in our own state is whether it's empty.
    const [isEmptyEditorValue_, setIsEmptyEditorValue] = useState(initialEditorState === undefined)
    const isEmptyEditorValue = editorRef.current ? editorRef.current.isEmpty() : isEmptyEditorValue_
    const onEditorChange = useCallback(
        (value: SerializedPromptEditorValue): void => {
            onChange?.(value)
            setIsEmptyEditorValue(!value?.text?.trim())
        },
        [onChange]
    )

    const submitDisabled: SubmitButtonDisabled = isPendingPriorResponse
        ? 'isPendingPriorResponse'
        : isEmptyEditorValue
          ? 'emptyEditorValue'
          : false

    const onSubmitClick = useCallback(
        (addEnhancedContext: boolean) => {
            if (submitDisabled) {
                return
            }

            if (!editorRef.current) {
                throw new Error('No editorRef')
            }
            onSubmit(editorRef.current.getSerializedValue(), addEnhancedContext)
        },
        [submitDisabled, onSubmit]
    )

    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) when input is not empty.
            if (event && !event.shiftKey && !event.isComposing && !isEmptyEditorValue) {
                event.preventDefault()
                const addEnhancedContext = !event.altKey
                onSubmitClick(addEnhancedContext)
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
    const onBlur = useCallback<FocusEventHandler>(event => {
        // If we're shifting focus to one of our child elements, just skip this call because we'll
        // immediately set it back to true.
        const container = event.currentTarget as HTMLElement
        if (event.relatedTarget && container.contains(event.relatedTarget)) {
            return
        }

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
                editorRef.current?.setFocus(true, { moveCursorToEnd: true })
            }
        }
    }, [isEditorInitiallyFocused])

    /**
     * If the user clicks in a gap, focus the editor so that the whole component "feels" like an input field.
     */
    const onGapClick = useCallback(() => {
        editorRef.current?.setFocus(true, { moveCursorToEnd: true })
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

    useEffect(() => {
        if (__storybook__focus && editorRef.current) {
            setTimeout(() => focusEditor())
        }
    }, [__storybook__focus, focusEditor])

    const focused = Boolean(isEditorFocused || isFocusWithin || __storybook__focus)

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas
        <div
            className={clsx(
                styles.container,
                {
                    [styles.sent]: isSent,
                    [styles.focused]: focused,
                },
                className
            )}
            onMouseDown={onMaybeGapClick}
            onClick={onMaybeGapClick}
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
                    isEditorFocused={focused}
                    isPendingResponse={isPendingResponse}
                    onMentionClick={onMentionClick}
                    onSubmitClick={onSubmitClick}
                    submitDisabled={submitDisabled}
                    onGapClick={onGapClick}
                    focusEditor={focusEditor}
                    hidden={!focused && isSent && !isPendingResponse}
                    className={styles.toolbar}
                />
            )}
        </div>
    )
}
