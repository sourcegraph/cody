import { EditorView } from "prosemirror-view"
import { Node } from "prosemirror-model"
import { useCallback, useEffect, useRef, useState, type MouseEventHandler } from "react"
import type { ActorRefFrom } from 'xstate'
import { useActorRef, useSelector } from '@xstate/react'
import styles from './BaseEditor.module.css'
import { useDefaultContextForChat } from "../useInitialContext"
import clsx from "clsx"
import "prosemirror-view/style/prosemirror.css"
import { editorMachine, schema } from "./editor"
import { type Item, createSuggestionsMachine } from "./suggestions"
import { EditorState, Plugin, Transaction } from "prosemirror-state"
import { getAtMentionPosition, getAtMentionValue, hasAtMention } from "./atMention"
import { MentionView } from "./mentionNode"

export { type Item }

type BaseEditorProps<T> = {
    className?: string
    placeholder?: string
    onEnterKey?: (event: Event) => void
    onChange?: (doc: Node) => void
    fetchMenuData: (args: {query: string}) => Promise<Item<T>[]>
    onSuggestionsMenuClose?: () => void
    initialEditorState?: unknown
} & Pick<SuggestionsProps, 'getEmptyLabel' | 'getHeader'>

export const BaseEditor = <T,>(props: BaseEditorProps<T>) => {
    // TODO: Track token count/budget available
    const [suggestionsMachine] = useState(() => createSuggestionsMachine<T>())

    const mentionMenuDataRef = useRef<BaseEditorProps<T>['fetchMenuData']>(() => Promise.resolve([]))
    const suggestions = useActorRef(suggestionsMachine, { input: {
        fetchMenuData(args) {
            return mentionMenuDataRef.current(args)
        },
    }})

    // Update data fetch function as necessary
    useEffect(() => {
        mentionMenuDataRef.current = props.fetchMenuData
    }, [props.fetchMenuData])

    const editor = useActorRef(editorMachine, { input: {
        placeholder: props.placeholder,
        nodeViews: {
            mention(node) {
                return new MentionView(node)
            },
        },
        additionalPlugins: [
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

    useEffect(() => {
        let previous: Node | undefined
        const subscription = editor.subscribe(state => {
            if (state.context.editorState.doc !== previous) {
                previous = state.context.editorState.doc
                props.onChange?.(previous)
            }
        })
        return () => subscription.unsubscribe()
    }, [editor, props.onChange])

    const isSuggestionsMenuOpen = useSelector(suggestions, state => state.matches('open'))

    const initView = useCallback((node: HTMLDivElement) => {
        if (node) {
            editor.send({ type: 'setup', parent: node, initialDocument: props.initialEditorState ? schema.nodeFromJSON(props.initialEditorState) : undefined })
        } else {
            editor.send({type: 'teardown'})
        }
    }, [props.placeholder, props.onEnterKey, editor])

    return <>
        <div ref={initView} className={clsx(styles.editor, props.className)} />
        {isSuggestionsMenuOpen &&
            <Suggestions
                actor={suggestions}
                getEmptyLabel={props.getEmptyLabel}
                getHeader={props.getHeader}
                onSelect={index => {
                    const state = suggestions.getSnapshot().context
                    const selectedItem = state.filteredItems[index]
                    if (selectedItem) {
                        selectedItem.select(editor.getSnapshot().context.editorState, dispatch, selectedItem.data)
                    }
                }}
            />
        }
        </>
}

interface SuggestionsProps {
    actor: ActorRefFrom<ReturnType<typeof createSuggestionsMachine>>
    getHeader: () => React.ReactNode
    getEmptyLabel: (args: {filter: string}) => React.ReactNode
    onSelect?: (index: number) => void
}

const Suggestions: React.FC<SuggestionsProps> = props => {
    const defaultContext = useDefaultContextForChat()
    const container = useRef<HTMLDivElement | null>(null)
    const items = useSelector(props.actor, state => state.context.filteredItems)
    const selectedIndex = useSelector(props.actor, state => state.context.selectedIndex)
    const filter = useSelector(props.actor, state => state.context.filter) ?? ''
    const loading = useSelector(props.actor, state => state.matches({ open: 'loading' }))
    const menuPosition = useSelector(props.actor, state => state.context.position)

    useEffect(() => {
        container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [container, selectedIndex])

    useEffect(() => {
        defaultContext.initialContext
    }, [defaultContext])

    // Prevent input loosing focus
    const handleMouseDown: MouseEventHandler = useCallback(event => {
            event.preventDefault()
    }, [])

    const handleClick: MouseEventHandler = useCallback(event => {
        const listNode = event.target?.closest('li') as HTMLLIElement | null
        if (listNode?.parentNode) {
            const options = listNode.parentNode.querySelectorAll('[role="option"]')
            const index = [].indexOf.call(options, listNode)
            if (index !== -1) {
                props.onSelect?.(index)
            }
        }
    }, [])

    const header = props.getHeader()

    return <div
        ref={container}
        className={clsx(styles.suggestions, menuClass, { [styles.loading]: loading })}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ top: menuPosition.bottom, left: menuPosition.left }}>
        <ul>
            {header &&
                <li className={headerClass} aria-disabled="true">{header}</li>
            }
        {items.map((item, index) =>
            <li key={index} role="option" className={itemClass} aria-selected={index === selectedIndex}>
                {item.render(item.data)}
            </li>
        )}
            {loading && items.length === 0 && <li aria-disabled="true">Loading...</li>}
            {!loading && items.length === 0 && <li aria-disabled="true">{props.getEmptyLabel({filter})}</li>}
        </ul>
    </div>
}

const headerClass = '!tw-p-0 !tw-border-b-0 [&_[cmdk-group-heading]]:!tw-p-3 [&_[cmdk-group-heading]]:!tw-text-md [&_[cmdk-group-heading]]:!tw-leading-[1.2] [&_[cmdk-group-heading]]:!tw-h-[30px]'

const menuClass = ('tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground')

const itemClass = (
    'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'
)
