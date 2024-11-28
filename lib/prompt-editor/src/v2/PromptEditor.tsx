import { $insertFirst } from '@lexical/utils'
import {
    type ContextItem,
    ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    MentionMenuData,
    MentionQuery,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    type SerializedContextItem,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    displayPathBasename,
    getMentionOperations,
    serializeContextItem,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    $insertNodes,
    $setSelection,
} from 'lexical'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { BaseEditor, Item } from './BaseEditor'
import styles from '../PromptEditor.module.css'
import { useSetGlobalPromptEditorConfig } from '../config'
import { isEditorContentOnlyInitialContext, lexicalNodesForContextItems } from '../initialContext'
import { $selectEnd, getContextItemsForEditor, visitContextItemsForEditor } from '../lexicalUtils'
import { $createContextItemMentionNode } from '../nodes/ContextItemMentionNode'
import type { KeyboardEventPluginProps } from '../plugins/keyboardEvent'
import { EditorView } from 'prosemirror-view'
import { EditorState, Selection } from 'prosemirror-state'
import { Node } from 'prosemirror-model'
import { fromSerializedPromptEditorState, toSerializedPromptEditorValue } from './lexical-interop'
import { replaceDocument } from './prosemirror-utils'
import { useExtensionAPI } from '../useExtensionAPI'
import { ChatMentionContext } from '../plugins/atMentions/useChatContextItems'

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
    const editorRef = useRef<EditorView>(null)

    const hasSetInitialContext = useRef(false)

    const convertedInitialEditorState = useMemo(() => {
        return initialEditorState ? fromSerializedPromptEditorState(initialEditorState) : null
    }, [initialEditorState])

    useImperativeHandle(
        ref,
        (): PromptEditorRefAPI => ({
            setEditorState(state: SerializedPromptEditorState): void {
                const editor = editorRef.current
                if (editor) {
                    const doc = editor.state.schema.nodeFromJSON(fromSerializedPromptEditorState(state))
                    replaceDocument(editor, doc)
                }
            },
            getSerializedValue(): SerializedPromptEditorValue {
                if (!editorRef.current) {
                    throw new Error('PromptEditor has no Lexical editor ref')
                }
                return toSerializedPromptEditorValue(editorRef.current.state)
            },
            setFocus(focus, { moveCursorToEnd } = {}): Promise<void> {
                return new Promise(resolve => {
                    const editor = editorRef.current

                    if (editor) {
                        if (focus) {
                            if (moveCursorToEnd) {
                                editor.dispatch(
                                    editor.state.tr.setSelection(Selection.atEnd(editor.state.doc))
                                )
                            }

                            // Ensure element is focused in case the editor is empty. Copied
                            // from LexicalAutoFocusPlugin.
                            const doFocus = () =>
                                editor.focus()
                                editor.dispatch(
                                    editor.state.tr.scrollIntoView()
                                )
                            doFocus()

                            // HACK(sqs): Needed in VS Code webviews to actually get it to focus
                            // on initial load, for some reason.
                            setTimeout(doFocus)
                        } else {
                            editor.dom.blur()
                        }
                    }
                    resolve()
                })
            },
            appendText(text: string): Promise<void> {
                return new Promise(resolve => {
                    const editor = editorRef.current
                    if (editor) {
                        const tr = editor.state.tr.insertText(`${getWhitespace(editor.state.doc)}${text}`, editor.state.selection.from)
                        tr.setSelection(Selection.atEnd(tr.doc))
                        editor.dispatch(tr)
                    }
                    resolve()
                })
            },
            filterMentions(filter: (item: SerializedContextItem) => boolean): Promise<void> {
                return new Promise(resolve => {
                    const editor = editorRef.current
                    if (editor) {
                        const mentions: Node[] = []
                        editor.state.doc.descendants(node => {
                            if (node.type.name === 'mention') {
                                mentions.push(node)
                            }
                        })

                        const tr = editor.state.tr
                        // todo: figure out how to remove mention nodes
                    }
                    resolve()
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
                // todo: figure out how to add mention nodes
                return

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

                return new Promise(resolve =>
                    editorRef.current?.update(
                        () => {
                            switch (position) {
                                case 'before': {
                                    const nodesToInsert = lexicalNodesForContextItems(
                                        ops.create,
                                        {
                                            isFromInitialContext: false,
                                        },
                                        sep
                                    )
                                    const pNode = $createParagraphNode()
                                    pNode.append(...nodesToInsert)
                                    $insertFirst($getRoot(), pNode)
                                    $selectEnd()
                                    break
                                }
                                case 'after': {
                                    const lexicalNodes = lexicalNodesForContextItems(
                                        ops.create,
                                        {
                                            isFromInitialContext: false,
                                        },
                                        sep
                                    )
                                    const pNode = $createParagraphNode()
                                    pNode.append(
                                        $createTextNode(getWhitespace($getRoot())),
                                        ...lexicalNodes,
                                        $createTextNode(sep)
                                    )
                                    $insertNodes([pNode])
                                    $selectEnd()
                                    break
                                }
                            }
                        },
                        { onUpdate: resolve }
                    )
                )
            },
            setInitialContextMentions(items: ContextItem[]): Promise<void> {
                return new Promise(resolve => {
                    const editor = editorRef.current
                    if (!editor) {
                        return resolve()
                    }

                    // todo: figure out how to set initial context mentions

                    return resolve()

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

    // todo: do we need this?
    useSetGlobalPromptEditorConfig()

    const onBaseEditorChange = useCallback(
        (state: EditorState): void => {
            if (onChange) {
                onChange(toSerializedPromptEditorValue(state))
            }
        },
        [onChange]
    )

    useEffect(() => {
        if (initialEditorState) {
            const editor = editorRef.current
            if (editor) {
                const currentEditorState = normalizeEditorStateJSON(editor.state.doc.toJSON())
                const newEditorState = fromSerializedPromptEditorState(initialEditorState)
                if (!isEqual(currentEditorState, newEditorState)) {
                    replaceDocument(editor, editor.state.schema.nodeFromJSON(newEditorState))
                }
            }
        }
    }, [initialEditorState])

    // Hook into providers
    const mentionMenuData = useExtensionAPI().mentionMenuData
    const mentionSettings = useContext(ChatMentionContext)
    const [selectedProvider, setSelectedProvider] = useState<ContextMentionProviderMetadata | null>(null)

    function onSelection(view: EditorView, range: {from: number, to: number}, item: ContextItem|ContextMentionProviderMetadata) {
        if ('id' in item) {
            setSelectedProvider(item)
            queueMicrotask(() => {
                view.dispatch(
                    view.state.tr.delete(range.from + 1, range.to)
                )
            })
            return true
        } else {
            return {
                // todo: serialize item?
                replace: view.state.schema.node('mention', {item}, view.state.schema.text(getItemTitle(item))),
                appendSpaceIfNecessary: true,
            }
        }
    }

    const fetchMenuData = useCallback(({query}: {query: string}) => new Promise<Item<ContextItem|ContextMentionProviderMetadata>[]>((resolve, reject) => {
            let result: MentionMenuData
            return mentionMenuData({text: query, provider: selectedProvider?.id ?? null}).subscribe(
                next => {
                    result = next
                },
                error => reject(error),
                () => {
                    resolve([
                        ...result.providers.map(provider => ({
                            data: provider,
                            onSelected: onSelection,
                            render: renderItem,
                        })),
                        ...result.items?.map(item => ({
                            data: item,
                            onSelected: onSelection,
                            render: renderItem,
                        })) ?? [],
                    ])
                }
            )
    }), [mentionMenuData, mentionSettings, selectedProvider])

    return (
        <BaseEditor
            className={clsx(styles.editor, editorClassName, {
                [styles.disabled]: disabled,
                [styles.seamless]: seamless,
            })}
            //contentEditableClassName={contentEditableClassName}
            initialEditorState={convertedInitialEditorState}
            onChange={onBaseEditorChange}
            //onFocusChange={onFocusChange}
            //contextWindowSizeInTokens={contextWindowSizeInTokens}
            //editorRef={editorRef}
            placeholder={placeholder}
            //disabled={disabled}
            //aria-label="Chat message"
            onEnterKey={onEnterKey}
            fetchMenuData={fetchMenuData}
            onSuggestionsMenuClose={() => setSelectedProvider(null)}
            getEmptyLabel={({filter}) => getEmptyLabelComponent({provider: selectedProvider, filter})}
            getHeader={() => selectedProvider?.title ?? ''}
        />
    )
}

function renderItem(item: ContextItem|ContextMentionProviderMetadata): string {
    if ('id' in item) {
        return item.title
    }
    return getItemTitle(item)
}

function getEmptyLabelComponent(props: {provider: ContextMentionProviderMetadata|null, filter: string}): React.ReactNode {
    return getEmptyLabel(props.provider, { text: props.filter ?? '', provider: props.provider?.id ?? null })
}

function getEmptyLabel(
    parentItem: ContextMentionProviderMetadata | null,
    mentionQuery: MentionQuery
): string {
    if (!mentionQuery.text) {
        return parentItem?.queryLabel ?? 'Search...'
    }

    if (!parentItem) {
        return FILE_CONTEXT_MENTION_PROVIDER.emptyLabel!
    }
    if (parentItem.id === SYMBOL_CONTEXT_MENTION_PROVIDER.id && mentionQuery.text.length < 3) {
        return SYMBOL_CONTEXT_MENTION_PROVIDER.emptyLabel! + NO_SYMBOL_MATCHES_HELP_LABEL
    }

    return parentItem.emptyLabel ?? 'No results'
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

function getWhitespace(node: Node): string {
    const needsWhitespaceBefore = !/(^|\s)$/.test(node.textBetween(0, node.nodeSize))
    return needsWhitespaceBefore ? ' ' : ''
}

function getItemTitle(item: ContextItem): string {
    switch (item.type) {
        case 'symbol':
            return item.title ?? item.symbolName
        default:
            return item.title ?? displayPathBasename(item.uri)

    }
}
