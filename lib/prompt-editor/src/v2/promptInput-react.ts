import { useActorRef, useSelector } from "@xstate/react"
import { DataLoaderInput, promptInput } from "./promptInput"
import { ContextItem, ContextMentionProviderMetadata, serializeContextItem, SerializedContextItem } from "@sourcegraph/cody-shared"
import { Item } from "./Suggestions"
import { ActorRefFrom, fromCallback } from "xstate"
import { useEffect, useMemo, useRef } from "react"
import { Node } from "prosemirror-model"
import { MentionView } from "./MentionView"
import { replaceDocument } from "./prosemirror-utils"
import { EditorState } from "prosemirror-state"
import { Position } from "./atMention"
import type {AnyEventObject} from 'xstate'
import type { Observable } from "observable-fns"

type MenuItem = Item<ContextItem|ContextMentionProviderMetadata>
type PromptInputLogic = typeof promptInput
type PromptInputActor = ActorRefFrom<PromptInputLogic>

interface PromptEditorOptions {
    placeholder?: string
    initialDocument?: Node
    disabled?: boolean
    contextWindowSizeInTokens?: number

    onChange?: (doc: Node) => void
    onFocusChange?: (focus: boolean) => void
    onEnterKey?: (event: KeyboardEvent | null) => void

    fetchMenuData: (args: {query: string, parent?: ContextMentionProviderMetadata}) => Observable<MenuItem[]>
}

interface PromptEditorAPI {
    applySuggestion(index?: number): void
    setFocus(focus: boolean, options?: { moveCursorToEnd?: boolean }): void
    appendText(text: string): void
    addMentions(items: ContextItem[], position?: 'before' | 'after', sep?: string): void
    filterMentions(filter: (item: SerializedContextItem) => boolean): void
    setInitialContextMentions(items: ContextItem[]): void
    setDocument(doc: Node): void
    getEditorState(): EditorState
    ref(node: HTMLDivElement|null): void
}

function getCurrentEditorState(input: ActorRefFrom<typeof promptInput>): EditorState {
    return input.getSnapshot().context.editorState
}

export const useEditor = (options: PromptEditorOptions): [PromptInputActor, PromptEditorAPI] => {
    const fetchMenuData = useMemo(() => fromCallback<AnyEventObject, DataLoaderInput>(({input}) => {
        const subscription = options.fetchMenuData({query: input.query, parent: input.context}).subscribe(
            next => {
                input.parent.send({type: 'mentionsMenu.results.set', data: next})
            },
        )
        return () => subscription.unsubscribe()
    }), [options.fetchMenuData])

    const focused = useRef(false)

    const onFocusChangeRef = useRef(options.onFocusChange)
    onFocusChangeRef.current = options.onFocusChange
    const onEnterKeyRef = useRef(options.onEnterKey)
    onEnterKeyRef.current = options.onEnterKey

    const editor = useActorRef(promptInput.provide({
        actors: {
            menuDataLoader: fetchMenuData,
        },
    }), { input: {
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
                // For some reason we have to avoid calling onEnterKey when shift is pressed,
                // otherwise the editor's Shift-Enter keybinding will not be triggered.
                if (!event.shiftKey && event.key === 'Enter') {
                    onEnterKeyRef.current?.(event)
                    return event.defaultPrevented
                }
                return false
            },
            nodeViews: {
                mention(node) {
                    return new MentionView(node)
                },
            },
        },
        placeholder: options.placeholder,
        initialDocument: options.initialDocument,
        disabled: options.disabled,
        contextWindowSizeInTokens: options.contextWindowSizeInTokens,
    }})

    const api: PromptEditorAPI  = useMemo(() => ({
        setFocus(focus, options) {
            if (focus) {
                editor.send({type: 'focus', moveCursorToEnd: options?.moveCursorToEnd})
            } else {
                editor.send({type: 'blur'})
            }
        },
        setDocument(doc: Node) {
            editor.send({type: 'dispatch', transaction: replaceDocument(getCurrentEditorState(editor), doc)})
        },
        setInitialContextMentions(items) {
            editor.send({type: 'mentions.setInitial', items: items.map(serializeContextItem)})
        },
        appendText(text) {
            editor.send({type: 'text.append', text})
        },
        addMentions(
            items: ContextItem[],
            position: 'before' | 'after' = 'after',
            sep = ' '
        ) {
            editor.send({type: 'mentions.add', items: items.map(serializeContextItem), position, separator: sep})
        },
        filterMentions(filter: (item: SerializedContextItem) => boolean) {
            editor.send({type: 'mentions.filter', filter})
        },
        applySuggestion(index) {
            editor.send({type: 'mentionsMenu.apply', index})
        },
        getEditorState() {
            return getCurrentEditorState(editor)
        },
        ref(node: HTMLDivElement|null) {
            editor.send(
                node ? {type: 'setup', parent: node} : {type: 'teardown'}
            )
        }
    }), [editor])

    const onChangeRef = useRef(options.onChange)
    onChangeRef.current = options.onChange

    useEffect(() => {
        let previousDoc: Node|undefined
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

interface Suggestions {
    show: boolean
    items: MenuItem[]
    selectedIndex: number
    query: string
    position: Position
    parent: ContextMentionProviderMetadata | null
}

export function useMentionsMenu(input: PromptInputActor): Suggestions {
    const showMenu = useSelector(input, state => state.hasTag('show mentions menu'))
    const mentionsMenu = useSelector(input, state => state.context.mentionsMenu)

    return {
        parent: mentionsMenu.parent ?? null,
        show: showMenu,
        items: mentionsMenu.items,
        selectedIndex: mentionsMenu.selectedIndex,
        query: mentionsMenu.filter,
        position: mentionsMenu.position,
    }
}
