import {
    type ChatMessage,
    type ContextItemMedia,
    FAST_CHAT_INPUT_TOKEN_BUDGET,
    type Model,
    ModelTag,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    firstValueFrom,
    skipPendingOperation,
    textContentFromSerializedLexicalNode,
} from '@sourcegraph/cody-shared'
import {
    PromptEditor,
    type PromptEditorRefAPI,
    PromptEditorV2,
    useDefaultContextForChat,
    useExtensionAPI,
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
import { promptModeToIntent } from '../../../../../prompts/PromptsTab'
import { useTelemetryRecorder } from '../../../../../utils/telemetry'
import { useConfig } from '../../../../../utils/useConfig'
import { useLinkOpener } from '../../../../../utils/useLinkOpener'
import { useOmniBox } from '../../../../../utils/useOmniBox'
import styles from './HumanMessageEditor.module.css'
import type { SubmitButtonState } from './toolbar/SubmitButton'
import { Toolbar } from './toolbar/Toolbar'

/**
 * A component to compose and edit human chat messages and the settings associated with them.
 */
export const HumanMessageEditor: FunctionComponent<{
    models: Model[]
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
    onSubmit: (intent?: ChatMessage['intent']) => void
    onStop: () => void

    isFirstInteraction?: boolean
    isLastInteraction?: boolean
    isEditorInitiallyFocused?: boolean
    className?: string

    editorRef?: React.RefObject<PromptEditorRefAPI | null>

    /** For use in storybooks only. */
    __storybook__focus?: boolean

    intent?: ChatMessage['intent']
    manuallySelectIntent: (intent: ChatMessage['intent']) => void
    __logPrefix?: string
}> = ({
    models,
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
    isLastInteraction,
    isEditorInitiallyFocused,
    className,
    editorRef: parentEditorRef,
    __storybook__focus,
    onEditorFocusChange: parentOnEditorFocusChange,
    intent,
    manuallySelectIntent,
    __logPrefix = 'HumanMessageEditor',
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const editorRef = useRef<PromptEditorRefAPI>(null)
    useImperativeHandle(parentEditorRef, (): PromptEditorRefAPI | null => editorRef.current)

    // The only PromptEditor state we really need to track in our own state is whether it's empty.
    const [isEmptyEditorValue, setIsEmptyEditorValue] = useState(
        initialEditorState
            ? textContentFromSerializedLexicalNode(initialEditorState.lexicalEditorState.root) === ''
            : true
    )
    // Previous input status to detect when input becomes empty
    const wasEmptyRef = useRef(isEmptyEditorValue)
    
    // Track when the input was last cleared to distinguish between user and system clearing
    const lastClearTimestamp = useRef(0)

    /**
     * Handles content changes in the editor.
     * - Tracks when input becomes empty vs non-empty
     * - Resets intent to 'chat' when input is cleared
     * - Propagates changes to parent component
     */
    const onEditorChange = useCallback(
        (value: SerializedPromptEditorValue): void => {
            const isEmpty = !value?.text?.trim()
            const wasEmpty = wasEmptyRef.current

            // Check if this is a manual clearing by the user vs. an automatic clearing
            // We only want to reset the intent if the user manually clears the input
            // We'll use a timestamp to distinguish between them
            const now = Date.now();
            const timeSinceLastClear = now - lastClearTimestamp.current;
            
            // When the input changes from non-empty to empty:
            if (!wasEmpty && isEmpty) {
                console.log(`[${__logPrefix}] Input cleared, time since last programmatic clear: ${timeSinceLastClear}ms`);
                
                // Only consider it a user-initiated clear if:
                // 1. It's been more than 200ms since last programmatic clear (to avoid false positives)
                // 2. We're in a special intent mode like edit/insert
                if ((intent === 'edit' || intent === 'insert') && 
                    intent !== undefined &&
                    timeSinceLastClear > 200) {
                    
                    console.log(`[${__logPrefix}] User manually cleared input, resetting intent to original intent`);
                    
                    // Store the current time right before the reset to prevent multiple resets
                    lastClearTimestamp.current = now;
                    
                    // Use the special 'reset' value to trigger restoration to previous intent
                    manuallySelectIntent('reset');
                }
                
                // Record when the input was cleared for future reference
                lastClearTimestamp.current = now;
            }

            wasEmptyRef.current = isEmpty
            onChange?.(value)
            setIsEmptyEditorValue(isEmpty)
        },
        [onChange, intent, manuallySelectIntent, __logPrefix]
    )

    const submitState: SubmitButtonState = isPendingPriorResponse
        ? 'waitingResponseComplete'
        : isEmptyEditorValue
          ? 'emptyEditorValue'
          : 'submittable'

    /**
     * Handles the submission of a message.
     * - Validates submission state (empty, waiting, submittable)
     * - Stops ongoing responses if needed
     * - Gets serialized value from editor
     * - Tracks empty state for next message
     * - Submits with the appropriate intent
     * - Records telemetry for the submission
     */
    const onSubmitClick = useCallback(
        (intent?: ChatMessage['intent'], forceSubmit?: boolean): void => {
            if (!forceSubmit && submitState === 'emptyEditorValue') {
                return
            }

            if (!forceSubmit && submitState === 'waitingResponseComplete') {
                onStop()
                return
            }

            if (!editorRef.current) {
                throw new Error('No editorRef')
            }

            const value = editorRef.current.getSerializedValue()

            // After submission, remember that we're starting with an empty editor next time
            // This will help with intent tracking for the next message
            requestAnimationFrame(() => {
                wasEmptyRef.current = true
            })

            // Use the proper intent for submission
            // The special intents (edit, insert) need to be preserved for handler selection
            const submissionIntent = intent;
            console.log(`[${__logPrefix}] Preparing to submit with intent:`, submissionIntent, 
                      `(should use "${submissionIntent}" handler on the server side)`);
            
            // Special intents like 'edit' should be used only for the current message
            // We'll reset immediately after submission to prevent getting stuck in edit mode
            if ((intent === 'edit' || intent === 'insert') && intent !== undefined) {
                console.log(`[${__logPrefix}] Will reset intent after submission`)
                
                // Use requestAnimationFrame to ensure this runs in the next frame after submission
                // This is synchronous with the React render cycle
                requestAnimationFrame(() => {
                    console.log(`[${__logPrefix}] Resetting intent to original intent for the next message`)
                    manuallySelectIntent('reset')
                })
            }
            
            console.log(`[${__logPrefix}] Submitting with intent:`, submissionIntent)

            // Pass the intent to the parent component's onSubmit handler
            parentOnSubmit(submissionIntent)

            telemetryRecorder.recordEvent('cody.humanMessageEditor', 'submit', {
                metadata: {
                    isFirstMessage: isFirstMessage ? 1 : 0,
                    isEdit: isSent ? 1 : 0,
                    messageLength: value.text.length,
                    contextItems: value.contextItems.length,
                    intent: [undefined, 'chat', 'search'].findIndex(i => i === submissionIntent),
                },
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        },
        [submitState, parentOnSubmit, onStop, telemetryRecorder.recordEvent, isFirstMessage, isSent, __logPrefix]
    )

    const omniBoxEnabled = useOmniBox()
    const {
        config: { experimentalPromptEditorEnabled },
    } = useConfig()

    /**
     * Handles Enter key press in the editor.
     * - Submits the message when Enter is pressed without Shift
     * - Prevents submission during composition, when empty, or with Shift key
     * - Prevents default behavior to avoid newlines when submitting
     */
    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) when input is not empty.
            if (!event || event.isComposing || isEmptyEditorValue || event.shiftKey) {
                return
            }
            event.preventDefault()
            onSubmitClick()
        },
        [isEmptyEditorValue, onSubmitClick]
    )

    const [isEditorFocused, setIsEditorFocused] = useState(false)
    /**
     * Tracks focus state of the editor and notifies parent component.
     * Used to manage UI states that depend on editor focus.
     */
    const onEditorFocusChange = useCallback(
        (focused: boolean): void => {
            setIsEditorFocused(focused)
            parentOnEditorFocusChange?.(focused)
        },
        [parentOnEditorFocusChange]
    )

    const [isFocusWithin, setIsFocusWithin] = useState(false)
    /**
     * Handles focus events on the container element.
     * Sets focus-within state to true when any child element receives focus.
     */
    const onFocus = useCallback(() => {
        setIsFocusWithin(true)
    }, [])
    /**
     * Handles blur events on the container element.
     * Sets focus-within state to false when focus moves outside the container,
     * but ignores blur events when focus is moving between child elements.
     */
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
    /**
     * Handles clicks on the container, determining if it's a gap click or a toolbar button click.
     * If it's a gap click (clicking on the container itself), focuses the editor.
     * If it's a toolbar button click, allows the event to propagate normally.
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

    const extensionAPI = useExtensionAPI()

    // Set up the message listener so the extension can control the input field.
    useClientActionListener(
        // Add new context to chat from the "Cody Add Selection to Cody Chat"
        // command, etc. Only add to the last human input field.
        { isActive: !isSent },
        /**
         * Handles actions from the client/extension to control the input field.
         * - Adds context items as mention chips
         * - Appends text to the editor
         * - Sets editor state
         * - Handles prompt intents
         * - Submits the input when requested
         */
        useCallback<ClientActionListener>(
            ({
                editorState,
                addContextItemsToLastHumanInput,
                appendTextToLastPromptEditor,
                submitHumanInput,
                setLastHumanInputIntent,
                setPromptAsInput,
            }) => {
                const updates: Promise<unknown>[] = []

                if (addContextItemsToLastHumanInput && addContextItemsToLastHumanInput.length > 0) {
                    const editor = editorRef.current
                    if (editor) {
                        updates.push(editor.addMentions(addContextItemsToLastHumanInput, 'after'))
                        updates.push(editor.setFocus(true))
                    }
                }

                if (appendTextToLastPromptEditor) {
                    // Schedule append text task to the next tick to avoid collisions with
                    // initial text set (add initial mentions first then append text from prompt)
                    updates.push(
                        new Promise<void>((resolve): void => {
                            requestAnimationFrame(() => {
                                if (editorRef.current) {
                                    editorRef.current
                                        .appendText(appendTextToLastPromptEditor)
                                        .then(resolve)
                                } else {
                                    resolve()
                                }
                            })
                        })
                    )
                }

                if (editorState) {
                    updates.push(
                        new Promise<void>(resolve => {
                            requestAnimationFrame(async () => {
                                if (editorRef.current) {
                                    await Promise.all([
                                        editorRef.current.setEditorState(editorState),
                                        editorRef.current.setFocus(true),
                                    ])
                                }
                                resolve()
                            })
                        })
                    )
                }

                let promptIntent: ChatMessage['intent'] = undefined

                if (setPromptAsInput) {
                    // set the intent
                    promptIntent = promptModeToIntent(setPromptAsInput.mode)

                    updates.push(
                        // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
                        new Promise<void>(async resolve => {
                            // Update timestamp to prevent triggering a reset when editor is cleared for the prompt
                            lastClearTimestamp.current = Date.now();
                            
                            // get initial context
                            const { initialContext } = await firstValueFrom(
                                extensionAPI.defaultContext().pipe(skipPendingOperation())
                            )
                            // hydrate raw prompt text
                            const promptEditorState = await firstValueFrom(
                                extensionAPI.hydratePromptMessage(setPromptAsInput.text, initialContext)
                            )

                            console.log(`[${__logPrefix}] manuallySelectIntent called with promptIntent:`, promptIntent)
                            manuallySelectIntent(promptIntent)

                            // update editor state
                            requestAnimationFrame(async () => {
                                if (editorRef.current) {
                                    // Mark the clearing as system-initiated
                                    lastClearTimestamp.current = Date.now();
                                    
                                    await Promise.all([
                                        editorRef.current.setEditorState(promptEditorState),
                                        editorRef.current.setFocus(true),
                                    ])
                                }
                                resolve()
                            })
                        })
                    )
                } else if (setLastHumanInputIntent) {
                    console.log(`[${__logPrefix}] manuallySelectIntent called with setLastHumanInputIntent:`, setLastHumanInputIntent)
                    manuallySelectIntent(setLastHumanInputIntent)
                }

                if (submitHumanInput || setPromptAsInput?.autoSubmit) {
                    Promise.all(updates).then(() =>
                        onSubmitClick(promptIntent || setLastHumanInputIntent || intent, true)
                    )
                }
            },
            [
                onSubmitClick,
                intent,
                manuallySelectIntent,
                extensionAPI.hydratePromptMessage,
                extensionAPI.defaultContext,
            ]
        )
    )

    const currentChatModel = useMemo(() => (models ? models[0] : undefined), [models, models?.[0]])

    const defaultContext = useDefaultContextForChat()

    useEffect(() => {
        if (isSent || !isFirstMessage || !editorRef?.current || intent === 'agentic') {
            return
        }

        // List of mention chips added to the first message.
        const editor = editorRef.current

        // Remove documentation open-link items; they do not provide context.
        // Remove current selection to avoid crowding the input box. User can always add it back.
        // Remove tree type if streaming is not supported.
        const excludedTypes = new Set([
            'open-link',
            ...(currentChatModel?.tags?.includes(ModelTag.StreamDisabled) ? ['tree'] : []),
        ])

        const filteredItems = defaultContext?.initialContext.filter(
            item => !excludedTypes.has(item.type)
        )
        void editor.setInitialContextMentions(filteredItems)
    }, [defaultContext?.initialContext, isSent, isFirstMessage, currentChatModel, intent])

    /**
     * Helper function to focus the editor programmatically.
     * Used by various event handlers and effects.
     */
    const focusEditor = useCallback(() => editorRef.current?.setFocus(true), [])

    useEffect(() => {
        if (__storybook__focus && editorRef.current) {
            setTimeout(() => focusEditor())
        }
    }, [__storybook__focus, focusEditor])

    const focused = Boolean(isEditorFocused || isFocusWithin || __storybook__focus)
    const contextWindowSizeInTokens =
        currentChatModel?.contextWindow?.context?.user ||
        currentChatModel?.contextWindow?.input ||
        FAST_CHAT_INPUT_TOKEN_BUDGET

    const linkOpener = useLinkOpener()
    /**
     * Handles opening external links from the editor.
     * Uses the linkOpener service to safely open URLs.
     */
    const openExternalLink = useCallback(
        (uri: string) => linkOpener?.openExternalLink(uri),
        [linkOpener]
    )

    const Editor = experimentalPromptEditorEnabled ? PromptEditorV2 : PromptEditor

    /**
     * Handles media uploads from the toolbar.
     * Adds the uploaded media as a mention chip in the editor when the editor is focused.
     */
    const onMediaUpload = useCallback(
        (media: ContextItemMedia) => {
            // Add the media context item as a mention chip in the editor.
            const editor = editorRef?.current
            if (editor && focused) {
                editor.upsertMentions([media], 'after')
            }
        },
        [focused]
    )

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
            <Editor
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
                openExternalLink={openExternalLink}
            />
            {!disabled && (
                <Toolbar
                    models={models}
                    userInfo={userInfo}
                    isEditorFocused={focused}
                    omniBoxEnabled={omniBoxEnabled}
                    onSubmitClick={onSubmitClick}
                    manuallySelectIntent={manuallySelectIntent}
                    submitState={submitState}
                    onGapClick={onGapClick}
                    focusEditor={focusEditor}
                    hidden={!focused && isSent}
                    className={styles.toolbar}
                    intent={intent}
                    extensionAPI={extensionAPI}
                    onMediaUpload={onMediaUpload}
                />
            )}
        </div>
    )
}
