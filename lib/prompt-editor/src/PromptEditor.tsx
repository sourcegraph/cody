import {
    type ContextItem,
    type SerializedContextItem,
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
import type { EditorState, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { BaseEditor } from './BaseEditor'
import styles from './PromptEditor.module.css'
import { useSetGlobalPromptEditorConfig } from './config'
import { isEditorContentOnlyInitialContext, lexicalNodesForContextItems } from './initialContext'
import {
    $insertMentions,
    $selectEnd,
    getContextItemsForEditor,
    getWhitespace,
    update,
    walkContextItemMentionNodes,
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
    setFocus(focus: boolean, options?: { moveCursorToEnd?: boolean }): Promise<void>
    appendText(text: string): Promise<void>
    addMentions(items: ContextItem[], position?: 'before' | 'after', sep?: string): Promise<void>
    /**
     * Similar to `addMentions`, but unlike `addMentions` it doesn't merge mentions with overlapping
     * ranges. Instead it updates the meta data of existing mentions with the same uri.
     *
     * @param items The context items to add or update.
     * @param position Where to insert the mentions, before or after the current input. Defaults to 'after'.
     * @param sep The separator to use between mentions. Defaults to a space.
     * @param focusEditor Whether to focus the editor after updating the mentions. Defaults to true.
     */
    upsertMentions(
        items: ContextItem[],
        position?: 'before' | 'after',
        sep?: string,
        focusEditor?: boolean
    ): Promise<void>
    filterMentions(filter: (item: SerializedContextItem) => boolean): Promise<void>
    setInitialContextMentions(items: ContextItem[]): Promise<void>
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
            setFocus(focus, { moveCursorToEnd } = {}): Promise<void> {
                return new Promise(resolve => {
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
                                        editor.getRootElement()?.focus({ preventScroll: false })
                                    doFocus()

                                    // HACK(sqs): Needed in VS Code webviews to actually get it to focus
                                    // on initial load, for some reason.
                                    setTimeout(doFocus)
                                },
                                { tag: 'skip-scroll-into-view', onUpdate: resolve }
                            )
                        } else {
                            editor.blur()
                            resolve?.()
                        }
                    } else {
                        resolve?.()
                    }
                })
            },
            appendText(text: string): Promise<void> {
                if (!editorRef.current) {
                    return Promise.resolve()
                }
                return update(editorRef.current, () => {
                    const root = $getRoot()
                    root.selectEnd()
                    $insertNodes([$createTextNode(`${getWhitespace(root)}${text}`)])
                    root.selectEnd()
                    return true
                })
            },
            filterMentions(filter: (item: SerializedContextItem) => boolean): Promise<void> {
                if (!editorRef.current) {
                    return Promise.resolve()
                }

                return update(editorRef.current, () => {
                    let updated = false
                    walkContextItemMentionNodes($getRoot(), node => {
                        if (!filter(node.contextItem)) {
                            node.remove()
                            updated = true
                        }
                    })
                    return updated
                })
            },
            async addMentions(
                items: ContextItem[],
                position: 'before' | 'after' = 'after',
                sep = ' '
            ): Promise<void> {
                const editor = editorRef.current
                if (!editor) {
                    return
                }

                const newContextItems = items.map(serializeContextItem)
                const existingMentions = getContextItemsForEditor(editor)
                const ops = getMentionOperations(existingMentions, newContextItems)

                await update(editor, () => {
                    if (ops.modify.size + ops.delete.size === 0) {
                        return false
                    }

                    walkContextItemMentionNodes($getRoot(), existing => {
                        const update = ops.modify.get(existing.contextItem)
                        if (update) {
                            // replace the existing mention inline with the new one
                            existing.replace($createContextItemMentionNode(update))
                        }
                        if (ops.delete.has(existing.contextItem)) {
                            existing.remove()
                        }
                    })
                    return true
                })

                return update(editor, () => {
                    if (ops.create.length === 0) {
                        return false
                    }

                    $insertMentions(ops.create, position, sep)
                    $selectEnd()
                    return true
                })
            },
            async upsertMentions(
                items,
                position = 'after',
                sep = ' ',
                focusEditor = true
            ): Promise<void> {
                const editor = editorRef.current
                if (!editor) {
                    return
                }

                const existingMentions = new Set(
                    getContextItemsForEditor(editor).map(getKeyForContextItem)
                )
                const toUpdate = new Map<string, ContextItem>()
                for (const item of items) {
                    const key = getKeyForContextItem(item)
                    if (existingMentions.has(key)) {
                        toUpdate.set(key, item)
                    }
                }

                await update(editor, () => {
                    if (toUpdate.size === 0) {
                        return false
                    }

                    walkContextItemMentionNodes($getRoot(), existing => {
                        const update = toUpdate.get(getKeyForContextItem(existing.contextItem))
                        if (update) {
                            // replace the existing mention inline with the new one
                            existing.replace($createContextItemMentionNode(update))
                        }
                    })
                    if (focusEditor) {
                        $selectEnd()
                    } else {
                        // Workaround for preventing the editor from stealing focus
                        // (https://github.com/facebook/lexical/issues/2636#issuecomment-1184418601)
                        // We need this until we can use the new 'skip-dom-selection' tag as
                        // explained in https://lexical.dev/docs/concepts/selection#focus, introduced
                        // by https://github.com/facebook/lexical/pull/6894
                        $setSelection(null)
                    }
                    return true
                })
                return update(editor, () => {
                    if (items.length === toUpdate.size) {
                        return false
                    }
                    $insertMentions(
                        items.filter(item => !toUpdate.has(getKeyForContextItem(item))),
                        position,
                        sep
                    )
                    if (focusEditor) {
                        $selectEnd()
                    } else {
                        // Workaround for preventing the editor from stealing focus
                        // (https://github.com/facebook/lexical/issues/2636#issuecomment-1184418601)
                        // We need this until we can use the new 'skip-dom-selection' tag as
                        // explained in https://lexical.dev/docs/concepts/selection#focus, introduced
                        // by https://github.com/facebook/lexical/pull/6894
                        $setSelection(null)
                    }
                    return true
                })
            },
            setInitialContextMentions(items: ContextItem[]): Promise<void> {
                const editor = editorRef.current
                if (!editor) {
                    return Promise.resolve()
                }

                return update(editor, () => {
                    let updated = false

                    if (!hasSetInitialContext.current || isEditorContentOnlyInitialContext(editor)) {
                        if (isEditorContentOnlyInitialContext(editor)) {
                            // Only clear in this case so that we don't clobber any text that was
                            // inserted before initial context was received.
                            $getRoot().clear()
                            updated = true
                        }
                        const nodesToInsert = lexicalNodesForContextItems(items, {
                            isFromInitialContext: true,
                        })

                        // Add whitespace after initial context items chips
                        if (items.length > 0) {
                            nodesToInsert.push($createTextNode(' '))
                            updated = true
                        }

                        $setSelection($getRoot().selectStart()) // insert at start
                        $insertNodes(nodesToInsert)
                        $selectEnd()
                        hasSetInitialContext.current = true
                    }

                    return updated
                })
            },
        }),
        []
    )

    useSetGlobalPromptEditorConfig()

    const onBaseEditorChange = useCallback(
        (_editorState: EditorState, editor: LexicalEditor): void => {
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

/**
 * Computes a unique key for a context item that can be used in e.g. a Map.
 *
 * The URI is not sufficient to uniquely identify a context item because the same URI can be used
 * for different types of context items or, in case of openctx, different provider URIs.
 */
function getKeyForContextItem(item: SerializedContextItem | ContextItem): string {
    let key = `${item.uri.toString()}|${item.type}`
    if (item.type === 'openctx') {
        key += `|${item.providerUri}`
    }
    return key
}
