import {
    type ChatMessage,
    FAST_CHAT_INPUT_TOKEN_BUDGET,
    type Model,
    ModelTag,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    textContentFromSerializedLexicalNode,
} from '@sourcegraph/cody-shared'
import {
    PromptEditor,
    type PromptEditorRefAPI,
    useClientState,
    useExtensionAPI,
    useObservable,
} from '@sourcegraph/prompt-editor'
import clsx from 'clsx'
import {
    type FocusEventHandler,
    type FunctionComponent,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import { type ClientActionListener, useClientActionListener } from '../../../../../client/clientState'
import { useTelemetryRecorder } from '../../../../../utils/telemetry'
import styles from './HumanMessageEditor.module.css'
import type { SubmitButtonState } from './toolbar/SubmitButton'
import { Toolbar } from './toolbar/Toolbar'

/**
 * A component to compose and edit human chat messages and the settings associated with them.
 */
export const HumanMessageEditor: FunctionComponent<{
    userInfo: UserAccountInfo

    initialEditorState: SerializedPromptEditorState | undefined
    placeholder: string

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    /** Whether this editor is for a message that has been sent already. */
    isSent: boolean

    /** Whether this editor is for a followup message to a still-in-progress assistant response. */
    isPendingPriorResponse: boolean

    disabled?: boolean

    onEditorFocusChange?: (focused: boolean) => void
    onChange?: (editorState: SerializedPromptEditorValue) => void
    onSubmit: (editorValue: SerializedPromptEditorValue, intent?: ChatMessage['intent']) => void
    onStop: () => void

    isFirstInteraction?: boolean
    isLastInteraction?: boolean
    isEditorInitiallyFocused?: boolean
    className?: string

    editorRef?: React.RefObject<PromptEditorRefAPI | null>

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = ({
    userInfo,
    initialEditorState,
    placeholder,
    isFirstMessage,
    isSent,
    isPendingPriorResponse,
    disabled = false,
    onChange,
    onSubmit: parentOnSubmit,
    onStop,
    isFirstInteraction,
    isLastInteraction,
    isEditorInitiallyFocused,
    className,
    editorRef: parentEditorRef,
    __storybook__focus,
    onEditorFocusChange: parentOnEditorFocusChange,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const editorRef = useRef<PromptEditorRefAPI>(null)
    useImperativeHandle(parentEditorRef, (): PromptEditorRefAPI | null => editorRef.current, [])

    // The only PromptEditor state we really need to track in our own state is whether it's empty.
    const [isEmptyEditorValue, setIsEmptyEditorValue] = useState(
        initialEditorState
            ? textContentFromSerializedLexicalNode(initialEditorState.lexicalEditorState.root) === ''
            : true
    )
    const onEditorChange = useCallback(
        (value: SerializedPromptEditorValue): void => {
            onChange?.(value)
            setIsEmptyEditorValue(!value?.text?.trim())
        },
        [onChange]
    )

    const submitState: SubmitButtonState = isPendingPriorResponse
        ? 'waitingResponseComplete'
        : isEmptyEditorValue
          ? 'emptyEditorValue'
          : 'submittable'

    const onSubmitClick = useCallback(
        (intent?: ChatMessage['intent']) => {
            if (submitState === 'emptyEditorValue') {
                return
            }

            if (submitState === 'waitingResponseComplete') {
                onStop()
                return
            }

            if (!editorRef.current) {
                throw new Error('No editorRef')
            }

            const value = editorRef.current.getSerializedValue()
            parentOnSubmit(value, intent)

            telemetryRecorder.recordEvent('cody.humanMessageEditor', 'submit', {
                metadata: {
                    isFirstMessage: isFirstMessage ? 1 : 0,
                    isEdit: isSent ? 1 : 0,
                    messageLength: value.text.length,
                    contextItems: value.contextItems.length,
                    intent: [undefined, 'chat', 'search'].findIndex(i => i === intent),
                },
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        },
        [submitState, parentOnSubmit, onStop, telemetryRecorder.recordEvent, isFirstMessage, isSent]
    )

    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) when input is not empty.
            if (!event || event.isComposing || isEmptyEditorValue || event.shiftKey) {
                return
            }

            event.preventDefault()

            // Submit search intent query when CMD + Options + Enter is pressed.
            if ((event.metaKey || event.ctrlKey) && event.altKey) {
                onSubmitClick('search')
                return
            }

            // Submit chat intent query when CMD + Enter is pressed.
            if (event.metaKey || event.ctrlKey) {
                onSubmitClick('chat')
                return
            }

            onSubmitClick()
        },
        [isEmptyEditorValue, onSubmitClick]
    )

    const [isEditorFocused, setIsEditorFocused] = useState(false)
    const onEditorFocusChange = useCallback(
        (focused: boolean): void => {
            setIsEditorFocused(focused)
            parentOnEditorFocusChange?.(focused)
        },
        [parentOnEditorFocusChange]
    )

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
            // It would be annoying if we clobber the user's intentional selection with the autofocus.
            const selection = window.getSelection()
            const userHasIntentionalSelection = selection && !selection.isCollapsed
            if (!userHasIntentionalSelection) {
                editorRef.current?.setFocus(true, { moveCursorToEnd: true })
                window.scrollTo({
                    top: window.document.body.scrollHeight,
                })
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

    const appendTextToEditor = useCallback((text: string): void => {
        if (!editorRef.current) {
            throw new Error('No editorRef')
        }
        editorRef.current.appendText(text)
    }, [])

    const onMentionClick = useCallback((): void => {
        if (!editorRef.current) {
            throw new Error('No editorRef')
        }
        if (editorRef.current.getSerializedValue().text.trim().endsWith('@')) {
            editorRef.current.setFocus(true, { moveCursorToEnd: true })
        } else {
            editorRef.current.appendText('@', true)
        }

        const value = editorRef.current.getSerializedValue()
        telemetryRecorder.recordEvent('cody.humanMessageEditor.toolbar.mention', 'click', {
            metadata: {
                isFirstMessage: isFirstMessage ? 1 : 0,
                isEdit: isSent ? 1 : 0,
                messageLength: value.text.length,
                contextItems: value.contextItems.length,
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })
    }, [telemetryRecorder.recordEvent, isFirstMessage, isSent])

    // Set up the message listener so the extension can control the input field.
    useClientActionListener(
        useCallback<ClientActionListener>(
            ({ addContextItemsToLastHumanInput, appendTextToLastPromptEditor }) => {
                if (addContextItemsToLastHumanInput) {
                    // Add new context to chat from the "Cody Add Selection to Cody Chat"
                    // command, etc. Only add to the last human input field.
                    if (isSent) {
                        return
                    }
                    if (
                        !addContextItemsToLastHumanInput ||
                        addContextItemsToLastHumanInput.length === 0
                    ) {
                        return
                    }
                    const editor = editorRef.current
                    if (editor) {
                        editor.addMentions(addContextItemsToLastHumanInput)
                        editor.setFocus(true)
                    }
                }

                if (appendTextToLastPromptEditor) {
                    // Append text to the last human input field.
                    if (isSent) {
                        return
                    }

                    // Schedule append text task to the next tick to avoid collisions with
                    // initial text set (add initial mentions first then append text from prompt)
                    requestAnimationFrame(() => {
                        if (editorRef.current) {
                            editorRef.current.appendText(appendTextToLastPromptEditor)
                        }
                    })
                }
            },
            [isSent]
        )
    )

    const model = useCurrentChatModel()

    let initialContext = useClientState().initialContext
    useEffect(() => {
        if (initialContext && !isSent && isFirstMessage) {
            const editor = editorRef.current
            if (editor) {
                // Don't show the initial codebase context if the model doesn't support streaming
                // as including context result in longer processing time.
                if (model?.tags?.includes(ModelTag.StreamDisabled)) {
                    initialContext = initialContext.filter(item => item.type !== 'tree')
                }
                editor.setInitialContextMentions(initialContext)
            }
        }
    }, [initialContext, isSent, isFirstMessage, model])

    const focusEditor = useCallback(() => editorRef.current?.setFocus(true), [])

    useEffect(() => {
        if (__storybook__focus && editorRef.current) {
            setTimeout(() => focusEditor())
        }
    }, [__storybook__focus, focusEditor])

    const focused = Boolean(isEditorFocused || isFocusWithin || __storybook__focus)
    const contextWindowSizeInTokens =
        model?.contextWindow?.context?.user ||
        model?.contextWindow?.input ||
        FAST_CHAT_INPUT_TOKEN_BUDGET

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas
        <div
            className={clsx(
                styles.container,
                {
                    [styles.sent]: isSent,
                    [styles.focused]: focused,
                },
                'tw-transition',
                className
            )}
            data-keep-toolbar-open={isLastInteraction || undefined}
            onMouseDown={onMaybeGapClick}
            onClick={onMaybeGapClick}
            onFocus={onFocus}
            onBlur={onBlur}
        >
            <PromptEditor
                seamless={true}
                placeholder={placeholder}
                initialEditorState={initialEditorState}
                onChange={onEditorChange}
                onFocusChange={onEditorFocusChange}
                onEnterKey={onEditorEnterKey}
                editorRef={editorRef}
                disabled={disabled}
                contextWindowSizeInTokens={contextWindowSizeInTokens}
                editorClassName={styles.editor}
                contentEditableClassName={styles.editorContentEditable}
            />
            {!disabled && (
                <Toolbar
                    userInfo={userInfo}
                    isEditorFocused={focused}
                    onMentionClick={onMentionClick}
                    onSubmitClick={onSubmitClick}
                    submitState={submitState}
                    onGapClick={onGapClick}
                    focusEditor={focusEditor}
                    appendTextToEditor={appendTextToEditor}
                    hidden={!focused && isSent}
                    className={styles.toolbar}
                />
            )}
        </div>
    )
}

function useCurrentChatModel(): Model | undefined {
    const models = useExtensionAPI().models
    return useObservable(useMemo(() => models(), [models])).value?.at(0)
}
