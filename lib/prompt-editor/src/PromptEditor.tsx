import {
    type ContextItem,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    getMentionOperations,
    serializeContextItem,
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
import type { EditorState, RootNode, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { BaseEditor } from './BaseEditor'
import styles from './PromptEditor.module.css'
import { useSetGlobalPromptEditorConfig } from './config'
import { isEditorContentOnlyInitialContext, lexicalNodesForContextItems } from './initialContext'
import {
    $selectAfter,
    $selectEnd,
    getContextItemsForEditor,
    visitContextItemsForEditor,
} from './lexicalUtils'
import { $createContextItemMentionNode } from './nodes/ContextItemMentionNode'
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
    setFocus(focus: boolean, options?: { moveCursorToEnd?: boolean }, cb?: () => void): void
    appendText(text: string, cb?: () => void): void
    addMentions(items: ContextItem[], cb?: () => void): void
    setInitialContextMentions(items: ContextItem[], cb?: () => void): void
    setEditorState(state: SerializedPromptEditorState, cb?: () => void): void
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
            setEditorState(state: SerializedPromptEditorState, onUpdate): void {
                const editor = editorRef.current
                if (editor) {
                    editor.setEditorState(editor.parseEditorState(state.lexicalEditorState))
                    onUpdate?.()
                }
            },
            getSerializedValue(): SerializedPromptEditorValue {
                if (!editorRef.current) {
                    throw new Error('PromptEditor has no Lexical editor ref')
                }
                return toSerializedPromptEditorValue(editorRef.current)
            },
            // biome-ignore lint/style/useDefaultParameterLast:
            setFocus(focus, { moveCursorToEnd } = {}, cb): void {
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
                            { tag: 'skip-scroll-into-view', onUpdate: cb }
                        )
                    } else {
                        editor.blur()
                        cb?.()
                    }
                } else {
                    cb?.()
                }
            },
            appendText(text: string, cb?: () => void): void {
                editorRef.current?.update(
                    () => {
                        const root = $getRoot()
                        root.selectEnd()
                        $insertNodes([$createTextNode(`${getWhitespace(root)}${text}`)])
                        root.selectEnd()
                    },
                    { onUpdate: cb }
                )
            },
            addMentions(items: ContextItem[], cb?: () => void): void {
                const editor = editorRef.current
                if (!editor) {
                    cb?.()
                    return
                }

                const newContextItems = items.map(serializeContextItem)
                const existingMentions = getContextItemsForEditor(editor)
                const ops = getMentionOperations(existingMentions, newContextItems)

                console.log(newContextItems, existingMentions, ops)

                if (ops.modify.size + ops.delete.size > 0) {
                    visitContextItemsForEditor(editor, existing => {
                        const update = ops.modify.get(existing.contextItem)
                        if (update) {
                            // replace the existing mention inline with the new one
                            existing.replace($createContextItemMentionNode(update))
                        }
                        if (ops.delete.has(existing.contextItem)) {
                            existing.remove()
                        }
                    })
                }
                if (ops.create.length === 0) {
                    cb?.()
                    return
                }

                editorRef.current?.update(
                    () => {
                        const nodesToInsert = lexicalNodesForContextItems(ops.create, {
                            isFromInitialContext: false,
                        })
                        $insertNodes([$createTextNode(getWhitespace($getRoot())), ...nodesToInsert])
                        const lastNode = nodesToInsert.at(-1)
                        if (lastNode) {
                            $selectAfter(lastNode)
                        }
                    },
                    { onUpdate: cb }
                )
            },
            setInitialContextMentions(items: ContextItem[], cb?: () => void): void {
                const editor = editorRef.current
                if (!editor) {
                    cb?.()
                    return
                }

                editor.update(
                    () => {
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
                    },
                    { onUpdate: cb }
                )
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

function getWhitespace(root: RootNode): string {
    const needsWhitespaceBefore = !/(^|\s)$/.test(root.getTextContent())
    return needsWhitespaceBefore ? ' ' : ''
}
