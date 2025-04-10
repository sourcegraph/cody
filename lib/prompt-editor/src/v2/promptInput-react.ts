import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    type SerializedContextItem,
    serializeContextItem,
} from '@sourcegraph/cody-shared'
import { useActorRef, useSelector } from '@xstate/react'
import type { Observable } from 'observable-fns'
import type { Node } from 'prosemirror-model'
import type { EditorState } from 'prosemirror-state'
import { type MutableRefObject, useEffect, useMemo, useRef } from 'react'
import { type ActorRefFrom, fromCallback } from 'xstate'
import type { AnyEventObject } from 'xstate'
import { usePromptEditorConfig } from '../config'
import { MentionView } from './MentionView'
import {
    addMentions,
    appendToDocument,
    filterMentions,
    handleSelectMenuItem,
    setDocument,
    upsertMentions,
} from './actions'
import { AT_MENTION_TRIGGER_CHARACTER, type Position, enableAtMention } from './plugins/atMention'
import {
    type DataLoaderInput,
    type MenuItem,
    type PromptInputOptions,
    promptInput,
    schema,
} from './promptInput'

export type PromptInputLogic = typeof promptInput
export type PromptInputActor = ActorRefFrom<PromptInputLogic>

interface PromptEditorOptions {
    /**
     * The placeholder text to display when the input is empty.
     */
    placeholder?: string
    /**
     * If true, the input is disabled and cannot be edited by the user.
     * The document can still be changed programmatically.
     */
    disabled?: boolean
    /**
     * The size of the context window in tokens. This is used to mark @mentions and
     * mentions in the menu if they exceed the context window size.
     */
    contextWindowSizeInTokens?: number
    /**
     * The initial (ProseMirror) document to display in the input.
     */
    initialDocument?: Node

    /**
     * Called when the document changes.
     */
    onChange?: (doc: Node) => void
    /**
     * Called when the input gains or loses focus.
     */
    onFocusChange?: (focus: boolean) => void
    /**
     * Called when the user presses the Enter key without modifiers.
     */
    onEnterKey?: (event: KeyboardEvent | null) => void

    /**
     * This function is called when an @mention is added or its value changes. The return value is used to
     * populate the mentions menu. The function is passed the current query (@mention) and the currently
     * selected provider (if any).
     */
    fetchMenuData: (args: { query: string; provider?: ContextMentionProviderMetadata }) => Observable<
        MenuItem[]
    >

    /**
     * Called when an 'open-link' context item is selected.
     */
    openExternalLink: (uri: string) => void
}

interface PromptEditorAPI {
    setFocus(focus: boolean, options?: { moveCursorToEnd?: boolean }): void
    appendText(text: string): void
    openAtMentionMenu(): void
    addMentions(items: ContextItem[], position?: 'before' | 'after', sep?: string): void
    upsertMentions(
        items: ContextItem[],
        position?: 'before' | 'after',
        sep?: string,
        focusEditor?: boolean
    ): void
    filterMentions(filter: (item: SerializedContextItem) => boolean): void
    setInitialContextMentions(items: ContextItem[]): void
    setDocument(doc: Node): void
    getEditorState(): EditorState
    applySuggestion(index?: number): void
    ref(node: HTMLDivElement | null): void
}

function getCurrentEditorState(input: ActorRefFrom<typeof promptInput>): EditorState {
    return input.getSnapshot().context.editorState
}

/**
 * Provides access to the prompt input editor and its API from a React component.
 */
export const usePromptInput = (options: PromptEditorOptions): [PromptInputActor, PromptEditorAPI] => {
    const { onContextItemMentionNodeMetaClick } = usePromptEditorConfig()

    const fetchMenuData = useMemo(
        () =>
            fromCallback<AnyEventObject, DataLoaderInput>(({ input }) => {
                const subscription = options
                    .fetchMenuData({ query: input.query, provider: input.context })
                    .subscribe(next => {
                        input.parent.send({ type: 'mentionsMenu.results.set', items: next })
                    })
                return () => subscription.unsubscribe()
            }),
        [options.fetchMenuData]
    )

    const focused = useRef(false)

    const onFocusChangeRef = useLatestRef(options.onFocusChange)
    const onEnterKeyRef = useLatestRef(options.onEnterKey)
    const openExternalLinkRef = useLatestRef(options.openExternalLink)
    const onContextItemMentionNodeMetaClickRef = useLatestRef(onContextItemMentionNodeMetaClick)

    const actorOptions = useMemo(
        (): PromptInputOptions => ({
            editorViewProps: {
                handleDOMEvents: {
                    focus: () => {
                        if (!focused.current) {
                            focused.current = true
                            onFocusChangeRef.current?.(true)
                        }
                    },
                    blur: () => {
                        if (focused.current) {
                            focused.current = false
                            onFocusChangeRef.current?.(false)
                        }
                    },
                },
                handleKeyDown: (_view, event) => {
                    if (event.key === 'Enter') {
                        onEnterKeyRef.current?.(event)
                        return event.defaultPrevented
                    }
                    return false
                },
                handleClickOn(_view, _pos, node, _nodePos, _event, _direct) {
                    if (node.type === schema.nodes.mention) {
                        onContextItemMentionNodeMetaClickRef.current?.(node.attrs.item)
                        return true
                    }
                    return false
                },
                nodeViews: {
                    mention(node) {
                        return new MentionView(node)
                    },
                },
            },
            handleSelectMenuItem: (item, api) => {
                handleSelectMenuItem(item, { ...api, openURI: uri => openExternalLinkRef.current(uri) })
            },
            placeholder: options.placeholder,
            initialDocument: options.initialDocument,
            disabled: options.disabled,
            contextWindowSizeInTokens: options.contextWindowSizeInTokens,
        }),
        [
            options.placeholder,
            options.initialDocument,
            options.disabled,
            options.contextWindowSizeInTokens,
        ]
    )

    const editor = useActorRef(
        promptInput.provide({
            actors: {
                menuDataLoader: fetchMenuData,
            },
        }),
        { input: actorOptions }
    )

    const api: PromptEditorAPI = useMemo(
        () => ({
            setFocus(focus, options) {
                editor.send(
                    focus
                        ? { type: 'focus', moveCursorToEnd: options?.moveCursorToEnd }
                        : { type: 'blur' }
                )
            },
            setDocument(doc: Node) {
                editor.send({ type: 'document.update', transaction: state => setDocument(state, doc) })
            },
            setInitialContextMentions(items) {
                editor.send({
                    type: 'document.mentions.setInitial',
                    items: items.map(serializeContextItem),
                })
            },
            appendText(text) {
                editor.send({
                    type: 'document.update',
                    transaction: state => appendToDocument(state, text),
                })
            },
            openAtMentionMenu() {
                editor.send({
                    type: 'document.update',
                    transaction: state =>
                        enableAtMention(appendToDocument(state, AT_MENTION_TRIGGER_CHARACTER)),
                })
            },
            addMentions(items: ContextItem[], position: 'before' | 'after' = 'after', seperator = ' ') {
                editor.send({
                    type: 'document.update',
                    transaction: state =>
                        addMentions(state, items.map(serializeContextItem), position, seperator),
                })
            },
            upsertMentions(
                items: ContextItem[],
                position: 'before' | 'after' = 'after',
                seperator = ' ',
                focusEditor = true
            ) {
                editor.send({
                    type: 'document.update',
                    transaction: state =>
                        upsertMentions(state, items.map(serializeContextItem), position, seperator),
                })
                if (focusEditor) {
                    editor.send({ type: 'focus' })
                }
            },
            filterMentions(filter: (item: SerializedContextItem) => boolean) {
                editor.send({
                    type: 'document.update',
                    transaction: state => filterMentions(state, filter),
                })
            },
            applySuggestion(index) {
                editor.send({ type: 'mentionsMenu.apply', index })
            },
            getEditorState() {
                return getCurrentEditorState(editor)
            },
            ref(node: HTMLDivElement | null) {
                editor.send(node ? { type: 'setup', container: node } : { type: 'teardown' })
            },
        }),
        [editor]
    )

    const onChangeRef = useRef(options.onChange)
    onChangeRef.current = options.onChange

    useEffect(() => {
        let previousDoc: Node | undefined
        const subscription = editor.subscribe(state => {
            if (state.context.editorState.doc !== previousDoc) {
                previousDoc = state.context.editorState.doc
                onChangeRef.current?.(previousDoc)
            }
        })
        return () => subscription.unsubscribe()
    }, [editor])

    return [editor, api] as const
}

interface MentionsMenuData {
    /**
     * Whether the mentions menu should be visible or not.
     */
    show: boolean
    /**
     * The items to display in the menu.
     */
    items: MenuItem[]
    /**
     * The index of the currently selected item.
     */
    selectedIndex: number
    /**
     * The query that was used to fetch the menu items.
     */
    query: string
    /**
     * The absolute screen coordinates at which the top-left corner of the menu should be placed.
     */
    position: Position
    /**
     * The currently selected provider, if any.
     */
    parent: ContextMentionProviderMetadata | null
}

/**
 * Provides access to the mentions menu state from a React component. Use this hook
 * together with {@link usePromptInput} to get access to the input.
 */
export function useMentionsMenu(input: PromptInputActor): MentionsMenuData {
    const showMenu = useSelector(input, state => state.hasTag('show mentions menu'))
    const mentionsMenu = useSelector(input, state => state.context.mentionsMenu)

    return {
        parent: mentionsMenu.parent ?? null,
        show: showMenu,
        items: mentionsMenu.items,
        selectedIndex: mentionsMenu.selectedIndex,
        query: mentionsMenu.query,
        position: mentionsMenu.position,
    }
}

/**
 * Helper hook to always update a ref with the latest value.
 */
function useLatestRef<T>(value: T): MutableRefObject<T> {
    const ref = useRef(value)

    useEffect(() => {
        ref.current = value
    }, [value])

    return ref
}
