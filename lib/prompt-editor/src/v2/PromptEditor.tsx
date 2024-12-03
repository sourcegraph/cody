import {
    type ContextItem,
    ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    FILE_RANGE_TOOLTIP_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    REMOTE_DIRECTORY_PROVIDER_URI,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    type SerializedContextItem,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, useCallback, useContext, useEffect, useImperativeHandle, useMemo } from 'react'
import styles from './PromptEditor.module.css'
import type { KeyboardEventPluginProps } from '../plugins/keyboardEvent'
import { fromSerializedPromptEditorState, toSerializedPromptEditorValue } from './lexical-interop'
import { useExtensionAPI } from '../useExtensionAPI'
import { ChatMentionContext } from '../plugins/atMentions/useChatContextItems'
import { schema } from './promptInput'
import "prosemirror-view/style/prosemirror.css"
import { Suggestions } from './Suggestions'
import { useEditor, useSuggestions } from './promptInput-react'
import { MentionMenuContextItemContent, MentionMenuProviderItemContent } from '../mentions/mentionMenu/MentionMenuItem'
import { useDefaultContextForChat } from '../useInitialContext'
import { Observable,  } from 'observable-fns'

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
    const defaultContext = useDefaultContextForChat()
    const mentionMenuData = useExtensionAPI().mentionMenuData
    const mentionSettings = useContext(ChatMentionContext)

    // TODO: This needs to be done differently because mentionMenuData never completes
    const fetchMenuData = useCallback(({query, parent}: {query: string, parent?: ContextMentionProviderMetadata}) => {

        const initialContext = [...defaultContext.initialContext, ...defaultContext.corpusContext]
        const queryLower = query.toLowerCase().trim()
        const filteredInitialContextItems = parent
            ? []
            : initialContext.filter(item =>
                queryLower
                    ? item.title?.toLowerCase().includes(queryLower) ||
                        item.uri.toString().toLowerCase().includes(queryLower) ||
                        item.description?.toString().toLowerCase().includes(queryLower)
                    : true
            )

        const filteredInitialItems = filteredInitialContextItems.map(item => ({data: item}))

        return Observable.of(filteredInitialItems).concat(
        mentionMenuData(parseMentionQuery(query, parent ?? null)).map(
            result => [
                    ...result.providers.map(provider => ({
                        data: provider,
                    })),
                    ...filteredInitialItems,
                    ...result.items
                        ?.filter(item => !filteredInitialContextItems.some(initialItem => areContextItemsEqual(item, initialItem)))
                        .map(item => ({data: item})) ?? [],
            ]))
    }, [mentionMenuData, mentionSettings, defaultContext])

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
        parent,
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
    // useSetGlobalPromptEditorConfig()

    useEffect(() => {
        if (initialEditorState) {
            const currentEditorState = normalizeEditorStateJSON(api.getEditorState().doc.toJSON())
            const newEditorState = fromSerializedPromptEditorState(initialEditorState)
            if (!isEqual(currentEditorState, newEditorState)) {
                api.setDocument(schema.nodeFromJSON(newEditorState))
            }
        }
    }, [initialEditorState, api])

    const renderItem = useCallback((data: ContextItem|ContextMentionProviderMetadata) => {
        if ('id' in data) {
            return <MentionMenuProviderItemContent provider={data} />
        }
        return <MentionMenuContextItemContent item={data} query={parseMentionQuery(query, parent)} />
    }, [query, parent])

    return <div
            className={clsx(styles.editor, editorClassName, {
                [styles.disabled]: disabled,
                [styles.seamless]: seamless,
            })}>
            <div className={contentEditableClassName} ref={api.ref} />
            {show && <Suggestions
                items={items}
                selectedIndex={selectedIndex}
                loading={isLoading}
                filter={query}
                menuPosition={position}
                getHeader={() => getItemsHeading(parent, query)}
                getEmptyLabel={() => getEmptyLabel(parent, query)}
                onSelect={index => api.applySuggestion(index)}
                renderItem={renderItem}
            />}
        </div>
}

function getItemsHeading(
    parentItem: ContextMentionProviderMetadata | null,
    query: string
): React.ReactNode {
    const mentionQuery = parseMentionQuery(query, parentItem)

    if (
        (!parentItem || parentItem.id === FILE_CONTEXT_MENTION_PROVIDER.id) &&
        mentionQuery.maybeHasRangeSuffix
    ) {
        return FILE_RANGE_TOOLTIP_LABEL
    }
    if (!parentItem) {
        return ''
    }
    if (
        parentItem.id === SYMBOL_CONTEXT_MENTION_PROVIDER.id ||
        parentItem.id === FILE_CONTEXT_MENTION_PROVIDER.id
    ) {
        // Don't show heading for these common types because it's just noisy.
        return ''
    }

    if (parentItem.id === REMOTE_DIRECTORY_PROVIDER_URI) {
        return (
            <div className="tw-flex tw-flex-gap-2 tw-items-center tw-justify-between">
                <div>
                    {mentionQuery.text.includes(':')
                        ? 'Directory - Select or search for a directory*'
                        : 'Directory - Select a repository*'}
                </div>
                <div
                    className={clsx(
                        'tw-text-xs tw-rounded tw-px-2 tw-text-foreground',
                        styles.experimental
                    )}
                >
                    Experimental
                </div>
            </div>
        )
    }

    return parentItem.title ?? parentItem.id
}

function getEmptyLabel(
    parentItem: ContextMentionProviderMetadata | null,
    query: string
): string {
    const mentionQuery = parseMentionQuery(query, parentItem)
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

function areContextItemsEqual(a: ContextItem, b: ContextItem): boolean {
    return a.type === b.type && a.uri.toString() === b.uri.toString()
}
