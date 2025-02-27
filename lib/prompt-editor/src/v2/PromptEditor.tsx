import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
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
import {
    type FunctionComponent,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
} from 'react'
import { ChatMentionContext } from '../plugins/atMentions/useChatContextItems'
import type { KeyboardEventPluginProps } from '../plugins/keyboardEvent'
import { useExtensionAPI } from '../useExtensionAPI'
import styles from './PromptEditor.module.css'
import { fromSerializedPromptEditorState, toSerializedPromptEditorValue } from './lexical-interop'
import { schema } from './promptInput'
import 'prosemirror-view/style/prosemirror.css'
import {
    MentionMenuContextItemContent,
    MentionMenuProviderItemContent,
} from '../mentions/mentionMenu/MentionMenuItem'
import { useDefaultContextForChat } from '../useInitialContext'
import { MentionsMenu } from './MentionsMenu'
import { useMentionsMenu, usePromptInput } from './promptInput-react'

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

    openExternalLink: (uri: string) => void
}

interface PromptEditorRefAPI {
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

    /**
     * Triggers opening the at-mention menu at the end of the current input value.
     */
    openAtMentionMenu(): Promise<void>
}

const SUGGESTION_LIST_LENGTH_LIMIT = 20

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
    openExternalLink,
}) => {
    // We use the interaction ID to differentiate between different
    // invocations of the mention-menu. That way upstream we don't trigger
    // duplicate telemetry events for the same view
    const interactionID = useRef(0)

    const convertedInitialEditorState = useMemo(() => {
        return initialEditorState
            ? schema.nodeFromJSON(fromSerializedPromptEditorState(initialEditorState))
            : undefined
    }, [initialEditorState])

    const defaultContext = useDefaultContextForChat()
    const mentionMenuData = useExtensionAPI().mentionMenuData
    const mentionSettings = useContext(ChatMentionContext)

    const fetchMenuData = useCallback(
        ({ query, provider }: { query: string; provider?: ContextMentionProviderMetadata }) => {
            const initialContext = [...defaultContext.initialContext, ...defaultContext.corpusContext]
            const queryLower = query.toLowerCase().trim()
            const filteredInitialContextItems = provider
                ? []
                : initialContext.filter(item =>
                      queryLower
                          ? item.title?.toLowerCase().includes(queryLower) ||
                            item.uri.toString().toLowerCase().includes(queryLower) ||
                            item.description?.toString().toLowerCase().includes(queryLower)
                          : true
                  )

            // NOTE: It's important to only emit after we receive new mentions menu data.
            // This ensures that we display the 'old' menu items until new have arrived
            // and prevents the menu from 'flickering'.
            return mentionMenuData({
                ...parseMentionQuery(query, provider ?? null),
                interactionID: interactionID.current,
                contextRemoteRepositoriesNames: mentionSettings.remoteRepositoriesNames,
            }).map(result => [
                ...result.providers,
                ...filteredInitialContextItems,
                ...(result.items
                    ?.filter(
                        item =>
                            !filteredInitialContextItems.some(initialItem =>
                                areContextItemsEqual(item, initialItem)
                            )
                    )
                    .slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
                    .map(item => ({ ...item, source: ContextItemSource.User })) ?? []),
            ])
        },
        [mentionMenuData, mentionSettings, defaultContext]
    )

    const [input, api] = usePromptInput({
        placeholder,
        initialDocument: convertedInitialEditorState,
        disabled,
        contextWindowSizeInTokens,
        onChange: doc => {
            onChange?.(toSerializedPromptEditorValue(doc))
        },
        onFocusChange,
        onEnterKey,
        fetchMenuData,
        openExternalLink,
    })

    const { show, items, selectedIndex, query, position: menuPosition, parent } = useMentionsMenu(input)

    useLayoutEffect(() => {
        // We increment the interaction ID when the menu is hidden because `fetchMenuData` can be
        // called before the menu is shown, which would result in a different interaction ID for the
        // first fetch.
        if (!show) {
            interactionID.current++
        }
    }, [show])

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
            async upsertMentions(
                items: ContextItem[],
                position: 'before' | 'after' = 'after',
                sep = ' ',
                focusEditor = true
            ): Promise<void> {
                api.upsertMentions(items, position, sep, focusEditor)
            },
            async setInitialContextMentions(items: ContextItem[]): Promise<void> {
                api.setInitialContextMentions(items)
            },
            async openAtMentionMenu() {
                api.openAtMentionMenu()
                api.setFocus(true)
            },
        }),
        [api]
    )

    useEffect(() => {
        if (initialEditorState) {
            const currentEditorState = normalizeEditorStateJSON(api.getEditorState().doc.toJSON())
            const newEditorState = fromSerializedPromptEditorState(initialEditorState)
            if (!isEqual(currentEditorState, newEditorState)) {
                api.setDocument(schema.nodeFromJSON(newEditorState))
            }
        }
    }, [initialEditorState, api])

    const renderItem = useCallback(
        (item: ContextItem | ContextMentionProviderMetadata) => {
            if ('id' in item) {
                return <MentionMenuProviderItemContent provider={item} />
            }
            // TODO: Support item.badge
            return <MentionMenuContextItemContent item={item} query={parseMentionQuery(query, parent)} />
        },
        [query, parent]
    )

    return (
        <div
            className={clsx(styles.editor, editorClassName, {
                [styles.disabled]: disabled,
                [styles.seamless]: seamless,
            })}
            //For compatibility with the CSS rules that target this attribute
            data-lexical-editor="true"
        >
            <div className={clsx(styles.input, contentEditableClassName)} ref={api.ref} />
            {show && (
                <MentionsMenu
                    items={items}
                    selectedIndex={selectedIndex}
                    menuPosition={menuPosition}
                    getHeader={() => getItemsHeading(parent, query)}
                    getEmptyLabel={() => getEmptyLabel(parent, query)}
                    onSelect={index => api.applySuggestion(index)}
                    renderItem={renderItem}
                />
            )}
        </div>
    )
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

function getEmptyLabel(parentItem: ContextMentionProviderMetadata | null, query: string): string {
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
