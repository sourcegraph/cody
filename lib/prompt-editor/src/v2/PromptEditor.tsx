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
    serializeContextItem,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { BaseEditor, Item } from './BaseEditor'
import styles from '../PromptEditor.module.css'
import { useSetGlobalPromptEditorConfig } from '../config'
import type { KeyboardEventPluginProps } from '../plugins/keyboardEvent'
import { EditorView } from 'prosemirror-view'
import { EditorState, Transaction, Plugin } from 'prosemirror-state'
import { fromSerializedPromptEditorState, toSerializedPromptEditorValue } from './lexical-interop'
import { replaceDocument } from './prosemirror-utils'
import { useExtensionAPI } from '../useExtensionAPI'
import { ChatMentionContext } from '../plugins/atMentions/useChatContextItems'
import { getAtMentionPosition, getAtMentionValue, hasAtMention, replaceAtMention, setMentionValue } from './atMention'
import { useActorRef } from '@xstate/react'
import { createMentionNode, editorMachine, schema } from './editor'
import { MentionView } from './mentionNode'
import { createSuggestionsMachine, SuggestionsMachineContext } from './suggestions'
import "prosemirror-view/style/prosemirror.css"

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

type ExtendedContextItem = (ContextItem | ContextMentionProviderMetadata) & { isFromInitialContext: boolean }

const suggestionsMachine = createSuggestionsMachine<ExtendedContextItem>()

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
    const mentionMenuDataRef = useRef<SuggestionsMachineContext<ExtendedContextItem>['fetchMenuData']>(() => Promise.resolve([]))

    const suggestions = useActorRef(suggestionsMachine, { input: {
        fetchMenuData(args) {
            return mentionMenuDataRef.current(args)
        },
    }})
    const convertedInitialEditorState = useMemo(() => {
        return initialEditorState ? schema.nodeFromJSON(fromSerializedPromptEditorState(initialEditorState)) : undefined
    }, [initialEditorState])


    const editor = useActorRef(editorMachine, { input: {
        placeholder: placeholder,
        initialDocument: convertedInitialEditorState,
        nodeViews: {
            mention(node) {
                return new MentionView(node)
            },
        },
        additionalPlugins: [
            // Plugin connects the at-mention plugin with suggestions
            new Plugin({
                view() {
                    return {
                        update(view: EditorView, prevState: EditorState) {
                            if (hasAtMention(view.state) && !hasAtMention(prevState)) {
                                suggestions.send({ type: 'suggestions.open', position: view.coordsAtPos(getAtMentionPosition(view.state)) })
                            } else if (!hasAtMention(view.state) && hasAtMention(prevState)) {
                                suggestions.send({type: 'suggestions.close'})
                            }

                            const mentionValue = getAtMentionValue(view.state)
                            if (mentionValue !== undefined && mentionValue !== getAtMentionValue(prevState)) {
                                suggestions.send({ type: 'suggestions.filter.update', filter: mentionValue.slice(1), position: view.coordsAtPos(getAtMentionPosition(view.state)) })
                            }
                            if (view.state.doc !== prevState.doc) {
                                onChange?.(toSerializedPromptEditorValue(view.state.doc))
                            }
                        }
                    }
                },
                props: {
                    handleKeyDown(view, event) {
                        if (hasAtMention(view.state)) {
                            switch (event.key) {
                                case 'ArrowDown': {
                                    suggestions.send({ type: 'suggestions.key.arrow-down' })
                                    return true
                                }
                                case 'ArrowUp': {
                                    suggestions.send({ type: 'suggestions.key.arrow-up' })
                                    return true
                                }
                                case 'Enter':
                                    const state = suggestions.getSnapshot().context
                                    const selectedItem = state.filteredItems[state.selectedIndex]
                                    if (selectedItem) {
                                        selectedItem.select(view.state, view.dispatch, selectedItem.data)
                                    }
                                    return true;
                                case 'Escape':
                                    // todo: remove at mention
                                    return true;
                            }
                        }
                        return false
                    },
                },
            })
        ],
    }})

    const dispatch = useCallback((tr: Transaction) => {
        editor.send({ type: 'editor.state.dispatch', transaction: tr })
    }, [editor])

    const getEditorState = useCallback(() => {
        return editor.getSnapshot().context.editorState
    }, [editor])


    const hasSetInitialContext = useRef(false)

    useImperativeHandle(
        ref,
        (): PromptEditorRefAPI => ({
            setEditorState(state: SerializedPromptEditorState): void {
                dispatch(replaceDocument(getEditorState(), schema.nodeFromJSON(fromSerializedPromptEditorState(state))))
            },
            getSerializedValue(): SerializedPromptEditorValue {
                return toSerializedPromptEditorValue(getEditorState().doc)
            },
            async setFocus(focus, { moveCursorToEnd } = {}): Promise<void> {
                if (focus) {
                    editor.send({type: 'focus', moveCursorToEnd})
                } else {
                    editor.send({type: 'blur'})
                }
            },
            async appendText(text: string): Promise<void> {
                editor.send({type: 'text.append', text})
            },
            async filterMentions(filter: (item: SerializedContextItem) => boolean): Promise<void> {
                editor.send({type: 'mentions.filter', filter})
            },
            async addMentions(
                items: ContextItem[],
                position: 'before' | 'after' = 'after',
                sep = ' '
            ): Promise<void> {
                editor.send({type: 'mentions.add', items: items.map(serializeContextItem), position, separator: sep})
            },
            async setInitialContextMentions(items: ContextItem[]): Promise<void> {
                // todo: implement
            },
        }),
        []
    )

    // todo: do we need this?
    useSetGlobalPromptEditorConfig()

    useEffect(() => {
        if (initialEditorState) {
            const currentEditorState = normalizeEditorStateJSON(getEditorState().doc.toJSON())
            const newEditorState = fromSerializedPromptEditorState(initialEditorState)
            if (!isEqual(currentEditorState, newEditorState)) {
                dispatch(replaceDocument(getEditorState(), schema.nodeFromJSON(newEditorState)))
            }
        }
    }, [initialEditorState, dispatch, getEditorState])

    // Hook into providers
    const mentionMenuData = useExtensionAPI().mentionMenuData
    const mentionSettings = useContext(ChatMentionContext)
    const [selectedProvider, setSelectedProvider] = useState<ContextMentionProviderMetadata | null>(null)

    function onSelection(state: EditorState, dispatch: (tr: Transaction) => void, item: ContextItem|ContextMentionProviderMetadata) {
        if ('id' in item) {
            setSelectedProvider(item)
            queueMicrotask(() => {
                dispatch(
                    setMentionValue(state, '')
                )
            })
        } else {
            dispatch(
                replaceAtMention(
                    state,
                    createMentionNode(serializeContextItem(item)),
                    true
                )
            )
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
                            select: onSelection,
                            render: renderItem,
                        })),
                        ...result.items?.map(item => ({
                            data: item,
                            select: onSelection,
                            render: renderItem,
                        })) ?? [],
                    ])
                }
            )
    }), [mentionMenuData, mentionSettings, selectedProvider])

    const initView = useCallback((node: HTMLDivElement) => {
        if (node) {
            editor.send({ type: 'setup', parent: node})
        } else {
            editor.send({type: 'teardown'})
        }
    }, [placeholder, onEnterKey, editor])

    return <div
            ref={initView}
            className={clsx(styles.editor, editorClassName, {
                [styles.disabled]: disabled,
                [styles.seamless]: seamless,
            })}
        />
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

function getItemTitle(item: ContextItem): string {
    switch (item.type) {
        case 'symbol':
            return item.title ?? item.symbolName
        default:
            return item.title ?? displayPathBasename(item.uri)

    }
}
