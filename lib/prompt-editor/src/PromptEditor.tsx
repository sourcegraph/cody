import {
    type ContextItem,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    toSerializedPromptEditorValue,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import {
    $createTextNode,
    $getRoot,
    $getSelection,
    $insertNodes,
    $setSelection,
    type LexicalEditor,
} from 'lexical'
import type { EditorState, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { isEqual } from 'lodash'
import { type FunctionComponent, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { BaseEditor } from './BaseEditor'
import styles from './PromptEditor.module.css'
import { useSetGlobalPromptEditorConfig } from './config'
import { isEditorContentOnlyInitialContext, lexicalNodesForContextItems } from './initialContext'
import { $selectAfter, $selectEnd } from './lexicalUtils'
import type { KeyboardEventPluginProps } from './plugins/keyboardEvent'

interface Props extends KeyboardEventPluginProps {
    editorClassName?: string
    contentEditableClassName?: string
    seamless?: boolean

    placeholder?: string

    initialEditorState?: SerializedPromptEditorState
    onChange?: (value: SerializedPromptEditorValue) => void
    onFocusChange?: (focused: boolean) => void

    contextWindowSizeInTokens?: number

    disabled?: boolean

    editorRef?: React.RefObject<PromptEditorRefAPI>
}

export interface PromptEditorRefAPI {
    getSerializedValue(): SerializedPromptEditorValue
    setFocus(focus: boolean, options?: { moveCursorToEnd?: boolean }): void
    appendText(text: string, ensureWhitespaceBefore?: boolean): void
    addMentions(items: ContextItem[]): void
    setInitialContextMentions(items: ContextItem[]): void
    setEditorState(state: SerializedPromptEditorState): void
}

/**
 * The component for composing and editing prompts.
 */
export const PromptEditor: FunctionComponent<Props> = ({
    editorClassName,
    contentEditableClassName,
    seamless,
    placeholder,
    initialEditorState,
    onChange,
    onFocusChange,
    contextWindowSizeInTokens,
    disabled,
    editorRef: ref,
    onEnterKey,
}) => {
    const editorRef = useRef<LexicalEditor>(null)

    const hasSetInitialContext = useRef(false)
    useImperativeHandle(
        ref,
        (): PromptEditorRefAPI => ({
            setEditorState(state: SerializedPromptEditorState): void {
                const editor = editorRef.current
                if (editor) {
                    editor.setEditorState(editor.parseEditorState(state.lexicalEditorState))
                }
            },
            getSerializedValue(): SerializedPromptEditorValue {
                if (!editorRef.current) {
                    throw new Error('PromptEditor has no Lexical editor ref')
                }
                return toSerializedPromptEditorValue(editorRef.current)
            },
            setFocus(focus, { moveCursorToEnd } = {}): void {
                const editor = editorRef.current
                if (editor) {
                    if (focus) {
                        editor.update(
                            () => {
                                const selection = $getSelection()
                                const root = $getRoot()

                                // Copied from LexicalEditor#focus, but we need to set the
                                // `skip-scroll-into-view` tag so that we don't always autoscroll.
                                if (selection !== null) {
                                    selection.dirty = true
                                } else if (root.getChildrenSize() !== 0) {
                                    root.selectEnd()
                                }

                                if (moveCursorToEnd) {
                                    root.selectEnd()
                                }

                                // Ensure element is focused in case the editor is empty. Copied
                                // from LexicalAutoFocusPlugin.
                                const doFocus = () =>
                                    editor.getRootElement()?.focus({ preventScroll: true })
                                doFocus()

                                // HACK(sqs): Needed in VS Code webviews to actually get it to focus
                                // on initial load, for some reason.
                                setTimeout(doFocus)
                            },
                            { tag: 'skip-scroll-into-view' }
                        )
                    } else {
                        editor.blur()
                    }
                }
            },
            appendText(text: string, ensureWhitespaceBefore?: boolean): void {
                editorRef.current?.update(() => {
                    const root = $getRoot()
                    const needsWhitespaceBefore = !/(^|\s)$/.test(root.getTextContent())
                    root.selectEnd()
                    $insertNodes([
                        $createTextNode(
                            `${ensureWhitespaceBefore && needsWhitespaceBefore ? ' ' : ''}${text}`
                        ),
                    ])
                    root.selectEnd()
                })
            },
            addMentions(items: ContextItem[]) {
                editorRef.current?.update(() => {
                    const nodesToInsert = lexicalNodesForContextItems(items, {
                        isFromInitialContext: false,
                    })
                    $insertNodes([$createTextNode(' '), ...nodesToInsert])
                    const lastNode = nodesToInsert.at(-1)
                    if (lastNode) {
                        $selectAfter(lastNode)
                    }
                })
            },
            setInitialContextMentions(items: ContextItem[]) {
                const editor = editorRef.current
                if (!editor) {
                    return
                }

                editor.update(() => {
                    if (!hasSetInitialContext.current || isEditorContentOnlyInitialContext(editor)) {
                        if (isEditorContentOnlyInitialContext(editor)) {
                            // Only clear in this case so that we don't clobber any text that was
                            // inserted before initial context was received.
                            $getRoot().clear()
                        }
                        const nodesToInsert = lexicalNodesForContextItems(items, {
                            isFromInitialContext: true,
                        })
                        $setSelection($getRoot().selectStart()) // insert at start
                        $insertNodes(nodesToInsert)
                        $selectEnd()
                        hasSetInitialContext.current = true
                    }
                })
            },
        }),
        []
    )

    useSetGlobalPromptEditorConfig()

    const onBaseEditorChange = useCallback(
        (_editorState: EditorState, editor: LexicalEditor, tags: Set<string>): void => {
            if (onChange) {
                onChange(toSerializedPromptEditorValue(editor))
            }
        },
        [onChange]
    )

    useEffect(() => {
        if (initialEditorState) {
            const editor = editorRef.current
            if (editor) {
                const currentEditorState = normalizeEditorStateJSON(editor.getEditorState().toJSON())
                const newEditorState = initialEditorState.lexicalEditorState
                if (!isEqual(currentEditorState, newEditorState)) {
                    editor.setEditorState(editor.parseEditorState(newEditorState))
                }
            }
        }
    }, [initialEditorState])

    return (
        <BaseEditor
            className={clsx(styles.editor, editorClassName, {
                [styles.disabled]: disabled,
                [styles.seamless]: seamless,
            })}
            contentEditableClassName={contentEditableClassName}
            initialEditorState={initialEditorState?.lexicalEditorState ?? null}
            onChange={onBaseEditorChange}
            onFocusChange={onFocusChange}
            contextWindowSizeInTokens={contextWindowSizeInTokens}
            editorRef={editorRef}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Chat message"
            onEnterKey={onEnterKey}
        />
    )
}

/**
 * Remove properties whose value is undefined, so that this value is the same (for deep-equality) in
 * JavaScript if it is JSON.stringify'd and re-JSON.parse'd.
 */
function normalizeEditorStateJSON(
    value: SerializedEditorState<SerializedLexicalNode>
): SerializedEditorState<SerializedLexicalNode> {
    return JSON.parse(JSON.stringify(value))
}
