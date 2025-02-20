/**
 * This module contains the logic for the prompt editor. This includes states and event handling but not the UI
 * except for what prosemirror provides.
 */

import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    type SerializedContextItem,
    contextItemMentionNodeDisplayText,
} from '@sourcegraph/cody-shared'
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { type Node, Schema } from 'prosemirror-model'
import { EditorState, Plugin, Selection, type Transaction } from 'prosemirror-state'
import { type EditorProps, EditorView } from 'prosemirror-view'
import {
    type ActorLike,
    type ActorRefFrom,
    type AnyEventObject,
    assign,
    enqueueActions,
    fromCallback,
    sendTo,
    setup,
    spawnChild,
    stopChild,
} from 'xstate'
import {
    type Position,
    createAtMentionPlugin,
    disableAtMention,
    getAtMentionPosition,
    getAtMentionValue,
    hasAtMention,
    hasAtMentionChanged,
    replaceAtMention,
    setAtMentionValue,
} from './plugins/atMention'
import { placeholderPlugin, setPlaceholder } from './plugins/placeholder'
import { isReadOnly, readonlyPlugin, setReadOnly } from './plugins/readonly'

export type MenuItem = ContextItem | ContextMentionProviderMetadata

/**
 * The prosemirror schema representing the structure of the prompt input value.
 * In addition to supporting standard paragraph and text nodes, the schema defines
 * 'mention nodes' which hold metadata about context items referenced by the user.
 */
export const schema = new Schema({
    nodes: {
        doc: {
            content: 'block+',
        },
        paragraph: {
            content: 'inline*',
            group: 'block',
            parseDOM: [{ tag: 'p' }],
            toDOM() {
                return ['p', 0]
            },
        },
        text: {
            group: 'inline',
        },
        mention: {
            group: 'inline',
            content: 'text*',
            attrs: {
                item: {},
                isFromInitialContext: { default: false },
            },
            atom: true,
            inline: true,
            toDOM(node) {
                return ['span', { 'data-mention-attrs': JSON.stringify(node.attrs) }, 0]
            },
            parseDOM: [
                {
                    tag: 'span[data-mention-attrs]',
                    node: 'mention',
                    getAttrs(node) {
                        if (node.dataset.mentionAttrs) {
                            return JSON.parse(node.dataset.mentionAttrs)
                        }
                        return {}
                    },
                },
            ],
        },
    },
})

/**
 * Creates a mention node from a context item.
 */
export function createMentionNode(attrs: {
    item: SerializedContextItem
    isFromInitialContext?: boolean
}): Node {
    return schema.nodes.mention.create(attrs, schema.text(contextItemMentionNodeDisplayText(attrs.item)))
}

interface ProseMirrorMachineInput {
    /**
     * Parent actor reference for sending events and subscribing to state changes.
     */
    parent: ActorRefFrom<typeof promptInput>
    /**
     * The initial editor state.
     */
    initialState: EditorState
    /**
     * The DOM element to mount the editor to. If null, the editor will not be mounted.
     */
    container: HTMLElement | null
    /**
     * Additional props to set on the ProseMirror view. This allows outside code to integrate with the editor.
     */
    props?: EditorProps
}

type ProseMirrorMachineEvent = { type: 'focus' } | { type: 'blur' }

/**
 * An actor that manages a ProseMirror editor.
 */
const prosemirrorActor = fromCallback<ProseMirrorMachineEvent, ProseMirrorMachineInput>(
    ({ receive, input }) => {
        const parent = input.parent
        const editor = new EditorView(input.container ? { mount: input.container } : null, {
            state: input.initialState,
            editable: state => !isReadOnly(state),
            dispatchTransaction(transaction) {
                parent.send({ type: 'dispatch', transaction })
            },
            // Handle keyboard events relevant for the mentions menu
            handleKeyDown(view, event) {
                if (parent.getSnapshot().hasTag('show mentions menu')) {
                    switch (event.key) {
                        case 'ArrowDown': {
                            parent.send({ type: 'mentionsMenu.select.next' })
                            return true
                        }
                        case 'ArrowUp': {
                            parent.send({ type: 'mentionsMenu.select.previous' })
                            return true
                        }
                        case 'Enter':
                            parent.send({ type: 'mentionsMenu.apply' })
                            return true
                    }

                    if (hasAtMention(view.state)) {
                        switch (event.key) {
                            case 'Escape':
                                view.dispatch(disableAtMention(view.state.tr))
                                return true
                        }
                    }
                }
                return false
            },
            handleDOMEvents: {
                focus() {
                    parent.send({ type: 'focus.change.focus' })
                },
                blur() {
                    parent.send({ type: 'focus.change.blur' })
                },
            },
            plugins: input.props ? [new Plugin({ props: input.props })] : undefined,
        })

        // Sync editor state with parent machine
        const subscription = parent.subscribe(state => {
            const nextState = state.context.editorState
            if (nextState !== editor.state) {
                const prevState = editor.state
                editor.updateState(nextState)

                if (
                    hasAtMention(nextState) &&
                    (!hasAtMention(prevState) || hasAtMentionChanged(nextState, prevState))
                ) {
                    // Compute the new position of the mentions menu whenever the @mention value changes.
                    // It's possible for the @mention to shift to the next line when the value is too long.
                    parent.send({
                        type: 'mentionsMenu.position.update',
                        position: editor.coordsAtPos(getAtMentionPosition(editor.state)),
                    })
                }
            }
        })

        receive(event => {
            switch (event.type) {
                case 'focus':
                    editor.focus()
                    editor.dispatch(editor.state.tr.scrollIntoView())
                    break
                case 'blur':
                    editor.dom.blur()
                    break
            }
        })

        return () => {
            subscription.unsubscribe()
            editor.destroy()
        }
    }
)

export interface DataLoaderInput {
    query: string
    context?: ContextMentionProviderMetadata
    parent: ActorLike<any, { type: 'mentionsMenu.results.set'; items: MenuItem[] }>
}

export interface MenuSelectionAPI {
    /**
     * Update the current value of the at-mention. This keeps the at-mention menu open.
     */
    setAtMentionValue(value: string): void
    /**
     * Remove the active at-mention and replace it with the provided string or node.
     */
    replaceAtMentionValue(value: string | Node): void
    /**
     * Remove the active at-mention.
     */
    deleteAtMention(): void
    /**
     * Sets the currently selected provider.
     */
    setProvider(item: ContextMentionProviderMetadata): void
    /**
     * Resets the currently selected menu item to the first one.
     */
    resetSelectedMenuItem(): void
}

type EditorEvents =
    // For attaching the editor to the DOM.
    | { type: 'setup'; container: HTMLElement }
    // For detaching the editor from the DOM.
    | { type: 'teardown' }

    // Focus the editor and optionally move the cursor to the end.
    | { type: 'focus'; moveCursorToEnd?: boolean }
    // Blur the editor.
    | { type: 'blur' }

    // Used to sync state from the UI component to the state machine
    | { type: 'update.placeholder'; placeholder: string }
    | { type: 'update.disabled'; disabled: boolean }
    | { type: 'update.contextWindowSizeInTokens'; size: number | null }

    // Apply a transaction to the current document
    | { type: 'document.update'; transaction: (editorState: EditorState) => Transaction }
    // Set the initial mentions of the input. Initial mentions are specifically marked. If the
    // input only contains initial mentions, the new ones will replace the existing ones.
    | { type: 'document.mentions.setInitial'; items: SerializedContextItem[] }

    // Used internally to notify the machine that an @mention has been added to the input (typically by typing '@').
    | { type: 'atMention.added' }
    // Used internall to notify the machine that an @mention has been removed.
    | { type: 'atMention.removed' }
    // Used internall to notify the machine that the value of an @mention has changed.
    | { type: 'atMention.updated'; query: string }
    // (Potentially) replace the current @mention with the provided context item. Not every item with cause
    // the @mention to be replaced, some might cause other changes to the machine's state.
    | { type: 'atMention.apply'; item: ContextItem | ContextMentionProviderMetadata }

    // Used to proxy ProseMirror transactions through the machine.
    | { type: 'dispatch'; transaction: Transaction }
    | { type: 'focus.change.focus' }
    | { type: 'focus.change.blur' }

type MentionsMenuEvents =
    | { type: 'mentionsMenu.select.next' }
    | { type: 'mentionsMenu.select.previous' }
    | { type: 'mentionsMenu.position.update'; position: Position }
    | { type: 'mentionsMenu.apply'; index?: number }
    | { type: 'mentionsMenu.results.set'; items: MenuItem[] }
    | { type: 'mentionsMenu.provider.set'; provider: ContextMentionProviderMetadata }

interface PromptInputContext {
    /**
     * The element that acts as the editor's container.
     */
    container: HTMLElement | null
    /**
     * ProseMirror editor state. Kept in sync with the ProseMirror view.
     */
    editorState: EditorState
    /**
     * Additional props to set on the ProseMirror view.
     */
    editorViewProps?: EditorProps
    /**
     * Keeps track of whether the initial context has been set or not.
     */
    hasSetInitialContext: boolean
    /**
     * Keeps track of the total available context size. We use this mark whether mentions are
     * potentially too large.
     */
    contextWindowSizeInTokens: number
    /**
     * The current size of all mentions in the editor.
     */
    currentContextSizeInTokens: number
    /**
     * Tracks state for the mentions menu.
     */
    mentionsMenu: {
        parent?: ContextMentionProviderMetadata
        query: string
        selectedIndex: number
        items: MenuItem[]
        position: Position
    }
    /**
     * A function for handling the selection of menu items. The function is passed a minimal API to apply
     * changes to the input.
     */
    handleSelectMenuItem: (item: MenuItem, api: MenuSelectionAPI) => void
}

export interface PromptInputOptions {
    /**
     * The placeholder text to display in the input.
     */
    placeholder?: string
    /**
     * If true, the input will be read-only. The value of the input can still be changed programmatically.
     */
    disabled?: boolean
    /**
     * The size of the context window in tokens. This is used to mark @mentions and mentions in the menu
     * if they exceed the context window size.
     */
    contextWindowSizeInTokens?: number
    /**
     * Additional props to set on the ProseMirror view. This allows outside code to integrate with the editor.
     */
    editorViewProps?: EditorProps
    /**
     * The initial value of the input.
     */
    initialDocument?: Node
    /**
     * A function for handling the selection of menu items. The function is passed a minimal API to apply
     * changes to the input.
     */
    handleSelectMenuItem?: (item: MenuItem, api: MenuSelectionAPI) => void
}

/**
 * This machine represents the prompt input. It handles three main concerns:
 * - The ProseMirror editor and its state
 * - The fetching of menu data for @mentions
 * - The management of the mentions menu
 *
 * The machine handles all operations that can be performed on the editor, including:
 * - Appending text
 * - Replacing the document
 * - Adding mentions
 * - Filtering mentions
 * - Setting initial mentions
 * - Replacing @mentions with context items
 *
 * Some of these operations could be handled in the PromptEditor component directly, but
 * co-location of the editor state and the operations that can be performed on it makes
 * it easier to reason about and test.
 */
export const promptInput = setup({
    types: {
        events: {} as EditorEvents | MentionsMenuEvents,
        input: {} as PromptInputOptions,
        context: {} as PromptInputContext,
    },
    actors: {
        editor: prosemirrorActor,
        /**
         * To be provided by the caller
         */
        menuDataLoader: fromCallback<AnyEventObject, DataLoaderInput>(() => {}),
    },
    actions: {
        /**
         * This action is called for every desired change to the editor state, including
         * changes that originate from the ProseMirror view itself. This allows us to
         * keep the state of the overall machine in sync with any changes to the editor state.
         */
        updateEditorState: enqueueActions(({ context, enqueue }, params: Transaction) => {
            const prevState = context.editorState
            const nextState = prevState.apply(params)

            if (nextState !== prevState) {
                enqueue.assign({ editorState: nextState })

                if (nextState.doc !== prevState.doc) {
                    // Recompute the total size of all present mentions
                    let newContextSize = 0
                    nextState.doc.descendants(node => {
                        if (node.type === schema.nodes.mention) {
                            newContextSize += (node.attrs.item as SerializedContextItem).size ?? 0
                            return false
                        }
                        return true
                    })

                    if (newContextSize !== context.currentContextSizeInTokens) {
                        enqueue.assign({ currentContextSizeInTokens: newContextSize })
                        // Re-process menu items as needed
                        enqueue({
                            // @ts-expect-error - type inference in named enqueueActions is a known problem
                            type: 'assignAndUpdateMenuItems',
                            params: [...context.mentionsMenu.items],
                        })
                    }
                }

                // Notify the machine of any changes to the at-mention value
                const mentionValue = getAtMentionValue(nextState)
                if (mentionValue !== undefined && mentionValue !== getAtMentionValue(prevState)) {
                    enqueue.raise({ type: 'atMention.updated', query: mentionValue.slice(1) })
                }

                // Notify the machine of any changes to the at-mention state
                const atMentionPresent = hasAtMention(nextState)
                if (atMentionPresent !== hasAtMention(prevState)) {
                    enqueue.raise(
                        atMentionPresent ? { type: 'atMention.added' } : { type: 'atMention.removed' }
                    )
                }
            }
        }),
        /**
         *  Updates the nested mentionsMenu context.
         */
        assignMentionsMenu: assign(
            ({ context }, params: Partial<PromptInputContext['mentionsMenu']>) => ({
                mentionsMenu: {
                    ...context.mentionsMenu,
                    ...params,
                },
            })
        ),
        /**
         * Assigns the provided menu items to the context and computes whether they exceed the context window size.
         */
        assignAndUpdateMenuItems: assign(({ context }, items: MenuItem[]) => {
            const remainingTokenBudget =
                context.contextWindowSizeInTokens - context.currentContextSizeInTokens
            for (const item of items) {
                if (!('id' in item) && item.size !== undefined) {
                    item.isTooLarge = item.size > remainingTokenBudget
                }
            }

            return {
                mentionsMenu: {
                    ...context.mentionsMenu,
                    items,
                },
            }
        }),
        /**
         * Invokes the data loader actor to fetch new menu data.
         */
        fetchMenuData: spawnChild('menuDataLoader', {
            id: 'fetchMenuData',
            input: ({ context, self }) => ({
                context: context.mentionsMenu.parent,
                query: context.mentionsMenu.query,
                parent: self,
            }),
        }),
    },
    guards: {
        canSetInitialMentions: ({ context }) => {
            return (
                !context.hasSetInitialContext || isEditorContentOnlyInitialContext(context.editorState)
            )
        },
        hasAtMention: ({ context }) => hasAtMention(context.editorState),
    },
    delays: {
        debounceAtMention: 300,
    },
}).createMachine({
    context: ({ input }): PromptInputContext => ({
        container: null,
        hasSetInitialContext: false,
        currentContextSizeInTokens: 0,
        contextWindowSizeInTokens: input.contextWindowSizeInTokens ?? Number.MAX_SAFE_INTEGER,
        editorViewProps: input.editorViewProps,
        editorState: EditorState.create({
            doc: input.initialDocument,
            selection: input.initialDocument ? Selection.atEnd(input.initialDocument) : undefined,
            schema,
            plugins: [
                // Enable undo/redo
                history(),
                ...createAtMentionPlugin(),
                // Enables basic keybindings for handling cursor movement and text insertion
                keymap({
                    ...baseKeymap,
                    'Mod-z': undo,
                    'Mod-y': redo,
                    'Shift-Enter': baseKeymap.Enter,
                }),
                // Adds a placeholder text
                placeholderPlugin(input.placeholder ?? ''),
                // Controls whether the editor is read-only
                readonlyPlugin(input.disabled),
            ],
        }),
        mentionsMenu: {
            query: '',
            selectedIndex: 0,
            items: [],
            position: { top: 0, left: 0, bottom: 0, right: 0 },
        },
        handleSelectMenuItem:
            input.handleSelectMenuItem ??
            ((_item, api) => {
                api.deleteAtMention()
            }),
    }),
    type: 'parallel',
    states: {
        // This substate manages all interactions with the ProseMirror editor and state.
        // Most events only affect the editor state, so they will always be handled, regardless of whether
        // the editor is mounted or not.
        editor: {
            initial: 'unmounted',
            states: {
                unmounted: {
                    on: {
                        setup: {
                            actions: assign(({ event }) => ({
                                container: event.container,
                            })),
                            target: 'mounted',
                        },
                    },
                },
                mounted: {
                    invoke: {
                        src: 'editor',
                        id: 'editor',
                        input: ({ context, self }): ProseMirrorMachineInput => ({
                            // @ts-expect-error -- for some reason TS doesn't like this. Mabye a self referencing inference issue?
                            parent: self,
                            container: context.container,
                            props: context.editorViewProps,
                            initialState: context.editorState,
                        }),
                    },
                    on: {
                        focus: {
                            actions: enqueueActions(({ event, context, enqueue }) => {
                                if (event.moveCursorToEnd) {
                                    enqueue({
                                        type: 'updateEditorState',
                                        params: context.editorState.tr.setSelection(
                                            Selection.atEnd(context.editorState.doc)
                                        ),
                                    })
                                }
                                enqueue.sendTo('editor', { type: 'focus' })
                            }),
                        },
                        blur: {
                            actions: sendTo('editor', { type: 'blur' }),
                        },
                        teardown: 'unmounted',
                    },
                },
            },
            on: {
                dispatch: {
                    actions: {
                        type: 'updateEditorState',
                        params: ({ event }) => event.transaction,
                    },
                },

                'update.placeholder': {
                    actions: {
                        type: 'updateEditorState',
                        params: ({ context, event }) =>
                            setPlaceholder(context.editorState.tr, event.placeholder),
                    },
                },
                'update.disabled': {
                    actions: {
                        type: 'updateEditorState',
                        params: ({ context, event }) =>
                            setReadOnly(context.editorState.tr, event.disabled),
                    },
                },
                'update.contextWindowSizeInTokens': {
                    actions: enqueueActions(({ context, enqueue, event }) => {
                        const size = event.size ?? Number.MAX_SAFE_INTEGER
                        if (size !== context.contextWindowSizeInTokens) {
                            enqueue.assign({ contextWindowSizeInTokens: size })
                            // Update menu items with updated size
                            enqueue({
                                type: 'assignAndUpdateMenuItems',
                                params: [...context.mentionsMenu.items],
                            })
                        }
                    }),
                },

                'document.update': {
                    actions: {
                        type: 'updateEditorState',
                        params: ({ event, context }) => event.transaction(context.editorState),
                    },
                },

                // TODO(@fkling): Find a good way to way move the change document logic out of the state machine
                // while keeping the concept of 'can set initial mentions' in it.
                'document.mentions.setInitial': {
                    guard: 'canSetInitialMentions',
                    actions: [
                        assign({ hasSetInitialContext: true }),
                        {
                            type: 'updateEditorState',
                            params: ({ context, event }) => {
                                const tr = context.editorState.tr
                                if (isEditorContentOnlyInitialContext(context.editorState)) {
                                    // Replace the current content with the new initial context if no other content is present
                                    tr.delete(Selection.atStart(tr.doc).from, tr.doc.content.size)
                                }
                                if (event.items.length > 0) {
                                    tr.insert(
                                        Selection.atStart(tr.doc).from,
                                        event.items.flatMap(item => [
                                            createMentionNode({ item, isFromInitialContext: true }),
                                            schema.text(' '),
                                        ])
                                    )
                                }
                                tr.setSelection(Selection.atEnd(tr.doc))
                                return tr
                            },
                        },
                    ],
                },

                // This event is raised when a mention item is supposed to be 'applied to the editor'. This can mean
                // different things depending on the item. The decision is delegated to `handleSelectMenuItem`, which
                // receives a small API object to make changes to the input.
                'atMention.apply': {
                    actions: enqueueActions(({ context, enqueue, event }) => {
                        const item = event.item

                        context.handleSelectMenuItem(item, {
                            setAtMentionValue(value) {
                                enqueue({
                                    type: 'updateEditorState',
                                    params: setAtMentionValue(context.editorState, value),
                                })
                            },
                            replaceAtMentionValue(value) {
                                enqueue({
                                    type: 'updateEditorState',
                                    params: replaceAtMention(
                                        context.editorState,
                                        typeof value === 'string' ? schema.text(value) : value
                                    ),
                                })
                            },
                            deleteAtMention() {
                                enqueue({
                                    type: 'updateEditorState',
                                    params: replaceAtMention(context.editorState, schema.text('')),
                                })
                            },
                            setProvider(item) {
                                // This is an event so that we can retrigger data fetching
                                enqueue.raise({ type: 'mentionsMenu.provider.set', provider: item })
                            },
                            resetSelectedMenuItem() {
                                enqueue({ type: 'assignMentionsMenu', params: { selectedIndex: 0 } })
                            },
                        })
                    }),
                },
                // The primary purpose of this event is to handle mentions menu item selection via the mouse.
                'mentionsMenu.apply': {
                    actions: [
                        // Update selected index if necessary
                        enqueueActions(({ enqueue, event }) => {
                            if (event.index !== undefined) {
                                enqueue({
                                    type: 'assignMentionsMenu',
                                    params: { selectedIndex: event.index },
                                })
                            }
                        }),
                        // Handle menu item selection
                        enqueueActions(({ context, enqueue }) => {
                            const item = context.mentionsMenu.items[context.mentionsMenu.selectedIndex]
                            if (item) {
                                enqueue.raise({ type: 'atMention.apply', item })
                            }
                        }),
                    ],
                },
            },
        },

        // This substate manages the fetching of menu data. It's main responsibility is to fetch new data as
        // @mentions are typed, and debounce those requests.
        dataLoader: {
            initial: 'idle',
            states: {
                idle: {
                    exit: [stopChild('fetchMenuData')],
                    on: {
                        'mentionsMenu.results.set': {
                            actions: {
                                type: 'assignAndUpdateMenuItems',
                                params: ({ event }) => event.items,
                            },
                        },
                    },
                },
                debounce: {
                    after: {
                        debounceAtMention: 'loading',
                    },
                    on: {
                        'atMention.updated': {
                            actions: {
                                type: 'assignMentionsMenu',
                                params: ({ event }) => ({
                                    query: event.query,
                                }),
                            },
                            reenter: true,
                        },
                    },
                },
                // This is an odd state. We need a way to trigger a new fetch when the query changes, but we also don't
                // know when the data loading is done. So we just always transition to idle and handle results there.
                loading: {
                    entry: 'fetchMenuData',

                    // This isn't great but we don't know when data loading is done
                    always: 'idle',
                },
            },
            on: {
                // When an @mention is added, we'll start fetching new data immediately.
                'atMention.added': '.loading',
                // When an @mention is removed, we'll stop listening for new data and reset any related state.
                'atMention.removed': {
                    actions: [
                        stopChild('fetchMenuData'),
                        { type: 'assignMentionsMenu', params: { parent: undefined, items: [] } },
                    ],
                    target: '.idle',
                },
                // When selecting a provider, we'll start fetching new data for that provider.
                'mentionsMenu.provider.set': {
                    actions: {
                        type: 'assignMentionsMenu',
                        params: ({ event }) => ({ parent: event.provider }),
                    },
                    target: '.loading',
                },
                // When the query changes, we'll debounce fetching new data.
                'atMention.updated': {
                    actions: [
                        stopChild('fetchMenuData'),
                        {
                            type: 'assignMentionsMenu',
                            params: ({ event }) => ({
                                query: event.query,
                            }),
                        },
                    ],
                    target: '.debounce',
                },
            },
        },

        // This substate manages the visibility and selection state of the mentions menu.
        mentionMenu: {
            initial: 'closed',
            states: {
                closed: {
                    on: {
                        // Open the menu when an @mention is added or the editor gains focus and has an @mention.
                        // When opening the menu via a new @mention, we'll reset the selected index to the first item.
                        'atMention.added': {
                            actions: { type: 'assignMentionsMenu', params: { selectedIndex: 0 } },
                            target: 'open',
                        },
                        'focus.change.focus': {
                            guard: 'hasAtMention',
                            target: 'open',
                        },
                    },
                },
                open: {
                    tags: 'show mentions menu',
                    on: {
                        // When the @mention is removed or the editor looses focus, we'll close the menu.
                        'atMention.removed': 'closed',
                        'focus.change.blur': 'closed',

                        'mentionsMenu.select.next': {
                            actions: {
                                type: 'assignMentionsMenu',
                                params: ({ context }) => ({
                                    selectedIndex:
                                        (context.mentionsMenu.selectedIndex + 1) %
                                        context.mentionsMenu.items.length,
                                }),
                            },
                        },
                        'mentionsMenu.select.previous': {
                            actions: {
                                type: 'assignMentionsMenu',
                                params: ({ context }) => ({
                                    selectedIndex:
                                        context.mentionsMenu.selectedIndex === 0
                                            ? context.mentionsMenu.items.length - 1
                                            : context.mentionsMenu.selectedIndex - 1,
                                }),
                            },
                        },
                    },
                },
            },
            on: {
                'mentionsMenu.position.update': {
                    actions: {
                        type: 'assignMentionsMenu',
                        params: ({ event }) => ({
                            position: event.position,
                        }),
                    },
                },
                // When a provider is selected we'll reset the selected index to the first item.
                'mentionsMenu.provider.set': {
                    actions: { type: 'assignMentionsMenu', params: { selectedIndex: 0 } },
                },
            },
        },
    },
})

/**
 * Returns all mentions in the document.
 * @param doc The document
 * @returns An array of mentions
 */
export function getMentions(doc: Node): SerializedContextItem[] {
    const mentions: SerializedContextItem[] = []
    doc.descendants(node => {
        if (node.type === schema.nodes.mention) {
            mentions.push(node.attrs.item)
            return false
        }
        return true
    })
    return mentions
}

/**
 * @param state The editor state
 * @returns Whether the editor content only consists of initial context items
 */
function isEditorContentOnlyInitialContext(state: EditorState): boolean {
    let onlyInitialContext = true
    state.doc.descendants(node => {
        if (!onlyInitialContext) {
            return false // no need to traverse anymore
        }

        switch (node.type.name) {
            case 'mention': {
                if (!node.attrs.isFromInitialContext) {
                    onlyInitialContext = false
                }
                return false // never traverse into mentions
            }
            case 'text': {
                if (node.text?.trim() !== '') {
                    onlyInitialContext = false
                }
                break
            }
            case 'paragraph':
            case 'doc':
                return onlyInitialContext
            default:
                onlyInitialContext = false
        }
        return onlyInitialContext
    })
    return onlyInitialContext
}
