import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { history, undo, redo} from "prosemirror-history"
import { EditorState, Plugin } from "prosemirror-state"
import { Node, Schema } from "prosemirror-model"
import { baseKeymap } from "prosemirror-commands"
import { InputRule, inputRules } from "prosemirror-inputrules"
import { keymap } from "prosemirror-keymap"
import { MutableRefObject, useCallback, useContext, useEffect, useRef, useState } from "react"
import { ActorRefFrom, assign, emit, fromCallback, setup} from 'xstate'
import { useActorRef, useSelector } from '@xstate/react'
import styles from './BaseEditor.module.css'
import { useDefaultContextForChat } from "../useInitialContext"
import { ContextItem, ContextMentionProviderMetadata, displayPathBasename, EMPTY, FILE_CONTEXT_MENTION_PROVIDER, MentionMenuData, MentionQuery, NO_SYMBOL_MATCHES_HELP_LABEL, REMOTE_REPOSITORY_PROVIDER_URI, SYMBOL_CONTEXT_MENTION_PROVIDER } from "@sourcegraph/cody-shared"
import { useExtensionAPI } from "../useExtensionAPI"
import { Observable } from "observable-fns"
import clsx from "clsx"
import { iconForProvider } from "../mentions/mentionMenu/MentionMenuItem"
import { AtSignIcon } from "lucide-react"
import {createRoot, Root} from 'react-dom/client'
import { ChatMentionContext, ChatMentionsSettings } from "../plugins/atMentions/useChatContextItems"

type MentionMenuQuery = (query: MentionQuery) => Observable<MentionMenuData>

const schema = new Schema({
    nodes: {
        text: {
            group: 'inline',
        },
        mention: {
            group: 'inline',
            attrs: {
                item:  { }
            },
            atom: true,
            inline: true,
            toDOM(node) {
                return ['span', {'data-context-item': JSON.stringify(node.attrs.item)}]
            },
            parseDOM: [
                {
                    tag: 'span[data-context-item]',
                    node: 'mention',
                    getAttrs(node) {
                        if (node.dataset.contextItem) {
                            return {
                                item: JSON.parse(node.dataset.contextItem),
                            }
                        }
                        return {}
                    },
                },
            ],
            leafText(node) {
                return (node.attrs.item as ContextItem).uri.toString()
            },
        },
        paragraph: {
            content: 'inline*',
            toDOM(node) {
                return ['p', 0]
            },
        },
        doc: {
            content: 'paragraph+',
        },
    },
})

interface SuggestionsMachineContext {
    filter: string,
    selectedIndex: number,
    filteredItems: Item[]
    mentionMenuDataRef: MutableRefObject<MentionMenuQuery>
    mentionSettingsRef: MutableRefObject<ChatMentionsSettings>
}

type Item = ContextItem|{type: 'provider', provider: ContextMentionProviderMetadata}

const suggestionsMachine = setup({
    types: {
        events: {} as
            | {type: 'open'}
            | {type: 'close'}
            | {type: 'arrow-down'}
            | {type: 'arrow-up'}
            | {type: 'enter'}
            | {type: 'select', index: number}
            | {type: 'update-filter', filter: string}
            | {type: 'set-items', items: Item[]}
        ,
        context: {} as SuggestionsMachineContext,
        input: {} as Pick<SuggestionsMachineContext, 'mentionMenuDataRef'|'mentionSettingsRef'>,
        emitted: {} as
            | {type: 'select'}
        ,
    },
    actors: {
        menuDataLoader: fromCallback<{type: ''}, SuggestionsMachineContext>(({input, sendBack}) => {
            const sub = input.mentionMenuDataRef.current({
                text: input.filter,
                provider: null,
                contextRemoteRepositoriesNames: input.mentionSettingsRef.current.remoteRepositoriesNames,

            }).subscribe(next => {
                sendBack({type: 'set-items', items: [...next.providers, ...next.items ?? []]})
            })
            return () => sub.unsubscribe()
        })
    },
}).createMachine({
    initial: 'closed',
    context: ({input}) => {
        return {
            filter: '',
            selectedIndex: 0,
            filteredItems: [],
            ...input,
        }
    },
    states: {
        closed: {
            on: {
                open: 'open',
            },
        },
        open: {
            initial: 'idle',
            states: {
                idle: {},
                debounce: {
                    after: {
                        300: 'loading',
                    },
                    always: {
                        guard: ({context}) => context.filter.length === 0,
                        target: 'loading',
                    },
                },
                loading: {
                    invoke: {
                        src: 'menuDataLoader',
                        input: ({context}) => context,
                    },
                    on: {
                        'set-items': {
                            target: 'idle',
                            actions: [
                                assign(({event}) => {
                                    return {
                                        filteredItems: event.items,
                                        selectedIndex: 0,
                                    }
                                })
                            ],
                        },
                    },
                },
            },
            on: {
                close: 'closed',
                "update-filter": {
                    target: '.debounce',
                    actions: assign(({event, context}) => {
                        return {
                            filter: event.filter,
                        }
                    })
                },
                "arrow-down": {
                    actions: assign({selectedIndex: ({context}) => (context.selectedIndex + 1) % context.filteredItems.length})
                },
                "arrow-up": {
                    actions: assign({selectedIndex: ({context}) => context.selectedIndex === 0 ? context.filteredItems.length - 1 : context.selectedIndex - 1})
                },
                'enter': {
                    actions: emit({type: 'select'})
                },
                'select': {
                    actions: [
                        assign({selectedIndex: ({event}) => event.index}),
                        emit({type: 'select'})
                    ],
                },
            }
        },
    },
})

interface SuggestionPluginState {
    open: boolean
    start: number
    decoration: DecorationSet
}

const emptyState: SuggestionPluginState = {
    open: false,
    start: 0,
    decoration: DecorationSet.empty
}

function createSuggestionsPlugin(actor: ActorRefFrom<typeof suggestionsMachine>): Plugin[] {
    const plugin = new Plugin<SuggestionPluginState>({
        state: {
            init(config, instance) {
                return emptyState
            },
            apply(tr, value, oldState, newState) {
                let nextValue = value
                const meta = tr.getMeta(plugin)
                if (meta) {
                    return {
                        open: true,
                        start: meta.position,
                        decoration: DecorationSet.create(newState.doc, [Decoration.inline(meta.position, meta.position + 1, {class: styles.active}, {inclusiveEnd: true})]),
                    }
                }
                if (nextValue.open && nextValue.decoration) {
                    const node = tr.doc.nodeAt(nextValue.start)

                    if (!node) {
                        return emptyState
                    }

                    // Check whether we have non-spaced text from trigger
                    const decorationSet = nextValue.decoration.map(tr.mapping, tr.doc)
                    if (decorationSet !== nextValue.decoration) {
                        const decoration = decorationSet.find()[0]
                        if (!decoration || /[\s\0]/.test(tr.doc.textBetween(decoration.from, decoration.to))) {
                            return emptyState

                        }
                        nextValue = {
                            ...nextValue,
                            decoration: decorationSet,
                        }
                    }
                    const pos = tr.selection.$from.pos
                    // Check whether selection moved outside of decoration
                    if (nextValue.decoration.find(pos, pos).length === 0) {
                        return emptyState
                    }
                }
                return nextValue
            },
        },
        view(view) {
            const sub = actor.on('select', event => {
                const state = plugin.getState(view.state)
                const decoration = state?.decoration.find()[0]
                if (decoration) {
                    const snapshot = actor.getSnapshot()
                    const newNode = schema.node('mention', {item: snapshot.context.filteredItems[snapshot.context.selectedIndex]})
                    let trx = view.state.tr.delete(decoration.from, decoration.to).insert(
                        decoration.from,
                        newNode
                    )
                    trx = trx.insertText(' ')
                    view.dispatch(trx.scrollIntoView())
                    view.focus()
                }
            })
            return {
                update(view, prevState) {
                    const next = plugin.getState(view.state)
                    const prev = plugin.getState(prevState)
                    if (next?.open && !prev?.open) {
                        actor.send({type: 'open'})
                    } else if (next && !next.open) {
                        actor.send({type: 'close'})
                    }
                    if (next?.open && next.decoration && next.decoration !== prev?.decoration) {
                        const decoration = next.decoration.find()[0]
                        if (decoration) {
                            actor.send({type: 'update-filter', filter: view.state.doc.textBetween(decoration.from + 1, decoration.to)})
                        }
                    }
                },
                destroy() {
                    sub.unsubscribe()
                },
            }
        },
        props: {
            handleKeyDown(view, event) {
                if (actor.getSnapshot().matches('open')) {
                    switch (event.key) {
                        case 'ArrowDown': {
                            actor.send({type: 'arrow-down'})
                            return true
                        }
                        case 'ArrowUp': {
                            actor.send({type: 'arrow-up'})
                            return true
                        }
                        case 'Enter':
                            actor.send({type: 'enter'})
                            return true;
                    }
                }
            },
            decorations(state): DecorationSet|undefined {
                return plugin.getState(state)?.decoration
            },
        },
    })

    return [plugin, inputRules({
        rules: [
            new InputRule(
                /(^|\s)@(?=\s|$)$/,
                (state, match, start, end) => {
                    return state.tr.insertText(match[0], start, end).setMeta(plugin, {position: start + (match[0][1] ? 1 : 0)})
                },
            )

        ]
    })]
}

function placeholder(text: string) {
  const update = (view: EditorView) => {
    if (view.state.doc.textContent) {
      view.dom.removeAttribute('data-placeholder');
    } else {
      view.dom.setAttribute('data-placeholder', text);
    }
  };

  return new Plugin({
    view(view) {
      update(view);

      return { update };
    }
  });
}

interface BaseEditorProps {
    placeholder?: string
    onEnterKey?: (event: Event) => void
    onChange?: (state: EditorState) => void
}

export const BaseEditor: React.FC = (props: BaseEditorProps) => {
    // TODO: Handle initial context
    const mentionMenuDataRef = useRef<(query: MentionQuery) => Observable<MentionMenuData>>(() => EMPTY)
    // TODO: What is resolution mode?
    const mentionSettingsRef = useRef<ChatMentionsSettings>({resolutionMode: 'local'})

    const [menuPosition, setMenuPosition] = useState({left: 0, top: 0})
    const mentionMenuData = useExtensionAPI().mentionMenuData
    const mentionSettings = useContext(ChatMentionContext)
    const actor = useActorRef(suggestionsMachine, {input: {mentionMenuDataRef}})
    const view = useRef<EditorView|null>(null)

    useEffect(() => {
        mentionMenuDataRef.current = mentionMenuData
    }, [mentionMenuData])
    useEffect(() => {
        mentionSettingsRef.current = mentionSettings
    }, [mentionSettings])

    const open = useSelector(actor, state => state.matches('open'))

    const createView = useCallback((node: HTMLDivElement) => {
        if (node) {
            const [plugin, input] = createSuggestionsPlugin(actor)
            const editor = new EditorView(node, {
                state: EditorState.create({
                    schema,
                    plugins: [
                        history(),
                        keymap({'Mod-z': undo, 'Mod-y': redo}),
                        plugin,
                        input,
                        keymap(baseKeymap),
                        new Plugin({
                            view(view) {
                                return {
                                    update(view, prevState) {
                                        const state = plugin.getState(view.state)
                                        if (state) {
                                            setMenuPosition(view.coordsAtPos(state.start))
                                        }
                                    },
                                }
                            },

                        }),
                        placeholder(props.placeholder ?? '')
                    ],
                }),
                nodeViews: {
                    mention(node) {
                        return new MentionView(node)
                    }
                },
                dispatchTransaction(tr) {
                    const newstate = editor.state.apply(tr)
                    props.onChange?.(newstate)
                    editor.updateState(newstate)
                },
            })
            view.current = editor
        } else {
            view.current?.destroy()
        }
    }, [props.placeholder, props.onEnterKey, actor])

    return <>
        <div ref={createView} className={styles.editor}/>
        {(open && <Suggestions actor={actor} style={{top: menuPosition.bottom, left: menuPosition.left}}/>)}
    </>
}

const Suggestions: React.FC<{actor: ActorRefFrom<typeof suggestionsMachine>, style: Record<string, number>}> = props => {
    const defaultContext = useDefaultContextForChat()
    const container = useRef<HTMLUListElement|null>(null)
    const items = useSelector(props.actor, state => state.context.filteredItems)
    const selectedIndex = useSelector(props.actor, state => state.context.selectedIndex)
    const filter = useSelector(props.actor, state => state.context.filter)
    const loading = useSelector(props.actor, state => state.matches({open: 'loading'}))

    useEffect(() => {
        container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block: 'nearest'})
    }, [container, selectedIndex])

    useEffect(() => {
        defaultContext.initialContext

    }, [defaultContext])

    const handleClick = useCallback(event => {
        const listNode = event.target.closest('li') as HTMLLIElement | null
        if (listNode?.parentNode) {
            props.actor.send({type: 'select', index: [].indexOf.call(listNode.parentNode.children, listNode)})
        }
    })
    return <ul ref={container} className={clsx(styles.suggestions, menuClass, {[styles.loading]: loading})} onClick={handleClick} style={props.style}>
        {items.map((item, index) =>
            <li className={itemClass} aria-selected={index === selectedIndex}>
                {getItemTitle(item)}
            </li>
        )}
        {loading && items.length === 0 && <li aria-disabled="true">Loading...</li>}
        {!loading && items.length === 0 && <li aria-disabled="true">{getEmptyLabel(null, {text: filter, provider: null})}</li>}
    </ul>
}

const menuClass = ('tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground')

const itemClass = (
    'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'
)

function getItemTitle(item: Item): string {
    switch (item.type) {
        case 'provider':
            return item.provider.title
        case 'symbol':
            return item.title ?? item.symbolName
        default:
            return item.title ?? displayPathBasename(item.uri)

    }
}

function getItemIcon(item: Item): string|undefined {
    switch (item.type) {
        case 'provider':
            return ''
        case 'symbol':
            return item.icon ?? item.kind === 'class' ? 'symbol-structure' : 'symbol-method'
        default:
            return item.icon
    }
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

class MentionView {
    public dom: HTMLElement
    private root: Root

    constructor(node: Node) {
        const item = node.attrs.item as ContextItem
        this.dom = document.createElement('span')
        this.dom.className = styles.mention
        this.root = createRoot(this.dom)
        this.root.render(<MentionChip item={item} />)
    }

    stopEvents() {
        return true
    }

    selectNode() {
        this.dom.classList.add(styles.mentionFocused)
    }

    deselectNode() {
        this.dom.classList.remove(styles.mentionFocused)
    }

    destroy() {
        this.root.unmount()
    }
}

function iconForContextItem(item: ContextItem): React.ComponentType {
    let providerURI = 'unknown'
    switch(item.type){
        case 'file':
            providerURI = FILE_CONTEXT_MENTION_PROVIDER.id
            break;
        case 'symbol':
            providerURI = SYMBOL_CONTEXT_MENTION_PROVIDER.id
            break;
        case 'repository':
        case 'tree':
            REMOTE_REPOSITORY_PROVIDER_URI
            break
        case 'openctx':
            providerURI = item.providerUri
            break
    }

    return iconForProvider[providerURI] ?? AtSignIcon
}

interface MentionChipProps {
    item: ContextItem
}

const MentionChip: React.FC<MentionChipProps> = props => {
    const Icon = iconForContextItem(props.item)
    return <>
        {Icon && <Icon />}
        <span>{getItemTitle(props.item)}</span>
    </>
}
