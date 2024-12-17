import { $insertFirst } from '@lexical/utils'
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
    $createParagraphNode,
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
import { $selectEnd, getContextItemsForEditor, visitContextItemsForEditor } from './lexicalUtils'
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
     */
    upsertMentions(items: ContextItem[], position?: 'before' | 'after', sep?: string): Promise<void>
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
                return new Promise(resolve =>
                    editorRef.current?.update(
                        () => {
                            const root = $getRoot()
                            root.selectEnd()
                            $insertNodes([$createTextNode(`${getWhitespace(root)}${text}`)])
                            root.selectEnd()
                        },
                        { onUpdate: resolve }
                    )
                )
            },
            filterMentions(filter: (item: SerializedContextItem) => boolean): Promise<void> {
                return new Promise(resolve => {
                    if (!editorRef.current) {
                        resolve()
                        return
                    }

                    visitContextItemsForEditor(editorRef.current, node => {
                        if (!filter(node.contextItem)) {
                            node.remove()
                        }
                    }).then(resolve)
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

                if (ops.modify.size + ops.delete.size > 0) {
                    await visitContextItemsForEditor(editor, existing => {
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
                    return
                }

                return insertMentions(editor, ops.create, position, sep)
            },
            async upsertMentions(items, position = 'after', sep = ' '): Promise<void> {
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

                // ! visitContextItemsForEditor must only be called when we have changes to make. Otherwise
                // the promise it returns will never resolve.
                if (toUpdate.size > 0) {
                    await visitContextItemsForEditor(editor, existing => {
                        const update = toUpdate.get(getKeyForContextItem(existing.contextItem))
                        if (update) {
                            // replace the existing mention inline with the new one
                            existing.replace($createContextItemMentionNode(update))
                        }
                    })
                }
                if (items.length === toUpdate.size) {
                    return
                }

                return insertMentions(
                    editor,
                    items.filter(item => !toUpdate.has(getKeyForContextItem(item))),
                    position,
                    sep
                )
            },
            setInitialContextMentions(items: ContextItem[]): Promise<void> {
                return new Promise(resolve => {
                    const editor = editorRef.current
                    if (!editor) {
                        return resolve()
                    }

                    editor.update(
                        () => {
                            if (
                                !hasSetInitialContext.current ||
                                isEditorContentOnlyInitialContext(editor)
                            ) {
                                if (isEditorContentOnlyInitialContext(editor)) {
                                    // Only clear in this case so that we don't clobber any text that was
                                    // inserted before initial context was received.
                                    $getRoot().clear()
                                }
                                const nodesToInsert = lexicalNodesForContextItems(items, {
                                    isFromInitialContext: true,
                                })

                                // Add whitespace after initial context items chips
                                if (items.length > 0) {
                                    nodesToInsert.push($createTextNode(' '))
                                }

                                $setSelection($getRoot().selectStart()) // insert at start
                                $insertNodes(nodesToInsert)
                                $selectEnd()
                                hasSetInitialContext.current = true
                            }
                        },
                        { onUpdate: resolve }
                    )
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

function getWhitespace(root: RootNode): string {
    const needsWhitespaceBefore = !/(^|\s)$/.test(root.getTextContent())
    return needsWhitespaceBefore ? ' ' : ''
}

function insertMentions(
    editor: LexicalEditor,
    items: (SerializedContextItem | ContextItem)[],
    position: 'before' | 'after',
    sep?: string
): Promise<void> {
    return new Promise(resolve =>
        editor.update(
            () => {
                const nodesToInsert = lexicalNodesForContextItems(
                    items,
                    {
                        isFromInitialContext: false,
                    },
                    sep
                )
                const pNode = $createParagraphNode()

                switch (position) {
                    case 'before': {
                        pNode.append(...nodesToInsert)
                        $insertFirst($getRoot(), pNode)
                        break
                    }
                    case 'after': {
                        pNode.append(
                            $createTextNode(getWhitespace($getRoot())),
                            ...nodesToInsert,
                            $createTextNode(sep)
                        )
                        $insertNodes([pNode])
                        break
                    }
                }

                $selectEnd()
            },
            { onUpdate: resolve }
        )
    )
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
