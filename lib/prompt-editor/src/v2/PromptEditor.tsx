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
import { type FunctionComponent, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import styles from '../PromptEditor.module.css'
import { useSetGlobalPromptEditorConfig } from '../config'
import type { KeyboardEventPluginProps } from '../plugins/keyboardEvent'
import { EditorState, Transaction } from 'prosemirror-state'
import { fromSerializedPromptEditorState, toSerializedPromptEditorValue } from './lexical-interop'
import { useExtensionAPI } from '../useExtensionAPI'
import { ChatMentionContext } from '../plugins/atMentions/useChatContextItems'
import { replaceAtMention, setMentionValue } from './atMention'
import { createMentionNode, schema } from './promptInput'
import "prosemirror-view/style/prosemirror.css"
import { type Item, Suggestions } from './Suggestions'
import { useEditor, useSuggestions } from './promptInput-react'

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
    const convertedInitialEditorState = useMemo(() => {
        return initialEditorState ? schema.nodeFromJSON(fromSerializedPromptEditorState(initialEditorState)) : undefined
    }, [initialEditorState])

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
                    createMentionNode({item: serializeContextItem(item)}),
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

    const [input, api] = useEditor({
        placeholder,
        initialDocument: convertedInitialEditorState,
        onChange: doc => {
            onChange?.(toSerializedPromptEditorValue(doc))
        },
        fetchMenuData,
    })

    const {
        show,
        items,
        selectedIndex,
        query,
        isLoading,
        position,
    } = useSuggestions(input)

    useImperativeHandle(
        ref,
        (): PromptEditorRefAPI => ({
            setEditorState(state: SerializedPromptEditorState): void {
                api.setDocument(schema.nodeFromJSON(fromSerializedPromptEditorState(state)))
            },
            getSerializedValue(): SerializedPromptEditorValue {
                return toSerializedPromptEditorValue(api.getEditorState().doc)
            },
            async setFocus(focus, { moveCursorToEnd } = {}): Promise<void> {
                api.setFocus(focus, { moveCursorToEnd })
            },
            async appendText(text: string): Promise<void> {
                api.appendText(text)
            },
            async filterMentions(filter: (item: SerializedContextItem) => boolean): Promise<void> {
                api.filterMentions(filter)
            },
            async addMentions(
                items: ContextItem[],
                position: 'before' | 'after' = 'after',
                sep = ' '
            ): Promise<void> {
                api.addMentions(items, position, sep)
            },
            async setInitialContextMentions(items: ContextItem[]): Promise<void> {
                api.setInitialContextMentions(items)
            },
        }),
        []
    )

    // todo: do we need this?
    useSetGlobalPromptEditorConfig()

    useEffect(() => {
        if (initialEditorState) {
            const currentEditorState = normalizeEditorStateJSON(api.getEditorState().doc.toJSON())
            const newEditorState = fromSerializedPromptEditorState(initialEditorState)
            if (!isEqual(currentEditorState, newEditorState)) {
                api.setDocument(schema.nodeFromJSON(newEditorState))
            }
        }
    }, [initialEditorState, api])

    return <div
            className={clsx(styles.editor, editorClassName, {
                [styles.disabled]: disabled,
                [styles.seamless]: seamless,
            })}>
            <div ref={api.ref} />
            {show && <Suggestions
                items={items}
                selectedIndex={selectedIndex}
                loading={isLoading}
                filter={query}
                menuPosition={position}
                getHeader={() => selectedProvider?.title ?? ''}
                getEmptyLabel={() => getEmptyLabelComponent({provider: selectedProvider, filter: query})}
                onSelect={index => api.applySuggestion(index)}
            />}
        </div>
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
