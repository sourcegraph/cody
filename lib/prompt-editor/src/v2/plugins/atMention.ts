import { InputRule, inputRules } from 'prosemirror-inputrules'
import type { Node } from 'prosemirror-model'
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import styles from './atMention.module.css'

export const AT_MENTION_TRIGGER_CHARACTER = '@'

export interface Position {
    top: number
    bottom: number
    left: number
    right: number
}

type AtMentionPluginState =
    | { type: 'inactive'; decoration: DecorationSet }
    | { type: 'active'; decoration: DecorationSet }

type SuggestionsPluginEvent = { type: 'enable' } | { type: 'disable' }

const emptyState: AtMentionPluginState = {
    type: 'inactive',
    decoration: DecorationSet.empty,
}

const atMentionPluginKey = new PluginKey<AtMentionPluginState>('suggestions')

/**
 * Creates a new at-mention plugin. The plugin tracks the presence of '@...' slices in the editor.
 * When an '@' character is typed, the plugin will activate and track the filter text.
 *
 * Note that this behavior has to be triggered explicitly, i.e. not every '@' character that happens
 * to be present in the value is an at-mention.
 *
 * @return An array of ProseMirror plugins
 */
export function createAtMentionPlugin(): Plugin[] {
    const plugin = new Plugin<AtMentionPluginState>({
        key: atMentionPluginKey,
        state: {
            init() {
                return emptyState
            },
            apply(tr, value, _oldState, newState): AtMentionPluginState {
                const event = tr.getMeta(plugin) as SuggestionsPluginEvent | undefined

                // Handle internal/explicit events first
                switch (event?.type) {
                    case 'enable': {
                        switch (value.type) {
                            case 'inactive': {
                                const position = newState.selection.from
                                return {
                                    type: 'active',
                                    decoration: DecorationSet.create(newState.doc, [
                                        Decoration.inline(
                                            // The current cursor position is after the '@' character
                                            position - 1,
                                            position,
                                            { class: styles.atMention },
                                            // This is necessary so that mapping changes will 'grow' the decoration, which
                                            // also acts as marker for the mention value
                                            { inclusiveEnd: true }
                                        ),
                                    ]),
                                }
                            }
                            default: {
                                return value
                            }
                        }
                    }
                    case 'disable': {
                        return emptyState
                    }
                }

                // Handle other changes, e.g. selection or input changes. In particular we have to
                // update the decoration that tracks the current filter text
                let nextValue = value

                if (nextValue.type === 'active') {
                    // Update decoration to reflect changes in the document
                    const decorationSet = nextValue.decoration.map(tr.mapping, tr.doc)

                    if (decorationSet !== nextValue.decoration) {
                        const decoration = decorationSet.find()[0]
                        // Remove the at-mention if the decoration was removed (e.g. by deleting the text of and arround
                        // the current at-mention), or if we determine it should be removed based on its current
                        // value.
                        if (
                            !decoration ||
                            shouldRemoveAtMention(tr.doc.textBetween(decoration.from, decoration.to))
                        ) {
                            return emptyState
                        }
                        nextValue = {
                            ...nextValue,
                            decoration: decorationSet,
                        }
                    }

                    // Close at-mention if selection is non-empty (i.e. not just the cursor)
                    if (!tr.selection.empty) {
                        return emptyState
                    }

                    // Close at-mention if cursor moved outside of the at-mention
                    const pos = tr.selection.$from.pos
                    if (nextValue.decoration.find(pos, pos).length === 0) {
                        return emptyState
                    }
                }

                return nextValue
            },
        },
        props: {
            decorations(state): DecorationSet | undefined {
                return plugin.getState(state)?.decoration
            },
        },
    })

    return [
        plugin,
        inputRules({
            rules: [
                new InputRule(
                    // Trigger on @, at beginning or after space
                    new RegExp(`(^|\\s)${AT_MENTION_TRIGGER_CHARACTER}$`),
                    (state, match, start, end) => {
                        return enableAtMention(state.tr.insertText(match[0], start, end))
                    }
                ),
            ],
        }),
    ]
}

/**
 * Replaces the current at-mention with the given node, if an at-mention is currently present.
 * @param state The current editor state
 * @param replacement The node to replace the at-mention with
 * @returns The transaction that replaces the at-mention
 */
export function replaceAtMention(state: EditorState, replacement: Node): Transaction {
    const decoration = getDecoration(state)
    if (decoration) {
        const tr = disableAtMention(state.tr.replaceWith(decoration.from, decoration.to, replacement))
        const end = decoration.from + replacement.nodeSize

        // Append a space after the node if necessary
        if (!/\s/.test(tr.doc.textBetween(end, end + 1))) {
            tr.insertText(' ', end)
        }
        return (
            tr
                // Move selection after the space after the node
                .setSelection(TextSelection.create(tr.doc, end + 1))
                .scrollIntoView()
        )
    }
    return state.tr
}
/**
 *
 * Removes the current at-mention if an at-mention is currently present.
 * @param state The current editor state
 * @param replacement The node to replace the at-mention with
 * @returns The transaction that replaces the at-mention
 */
export function deleteAtMention(state: EditorState): Transaction {
    const decoration = getDecoration(state)
    if (decoration) {
        const tr = disableAtMention(state.tr.deleteRange(decoration.from, decoration.to))

        return (
            tr
                // Move selection after the space after the node
                .setSelection(TextSelection.create(tr.doc, decoration.from))
                .scrollIntoView()
        )
    }
    return state.tr
}

/**
 * Returns whether an at-mention is currently present in the editor.
 *
 * @param state The current editor state
 * @returns Whether an at-mention is active
 */
export function hasAtMention(state: EditorState): boolean {
    return atMentionPluginKey.getState(state)?.type === 'active'
}

/**
 * Returns the value of the current at-mention, including the leading '@' character.
 * If no at-mention is active, returns undefined.
 *
 * @param state The current editor state
 * @returns The at-mention input or undefined
 */
export function getAtMentionValue(state: EditorState): string | undefined {
    const decoration = getDecoration(state)
    if (decoration) {
        return state.doc.textBetween(decoration.from, decoration.to)
    }
    return undefined
}

/**
 * Helper function to check whether at-mention has changed.
 * @param nextState The next editor state
 * @param prevState The previous editor state
 * @returns Whether the at-mention has changed
 */
export function hasAtMentionChanged(nextState: EditorState, prevState: EditorState): boolean {
    return getDecoration(nextState) !== getDecoration(prevState)
}

/**
 * Enables at-mention for the current cursor position. This function can be used to trigger
 * at-mentions programmatically.
 *
 * @param tr An editor transaction
 * @returns The updated transaction
 */
export function enableAtMention(tr: Transaction): Transaction {
    return tr.setMeta(atMentionPluginKey, { type: 'enable' } as SuggestionsPluginEvent)
}

/**
 * Disables at-mention. This will remove the decoration and meta-data for tracking the at-mention.
 * Essentially the at-mention will turn into plain text without any special meaning.
 *
 * @param tr An editor transaction
 * @returns The updated transaction
 */
export function disableAtMention(tr: Transaction): Transaction {
    return tr.setMeta(atMentionPluginKey, { type: 'disable' } as SuggestionsPluginEvent)
}

/**
 * Returns the start document position of the current at-mention.
 * @param state The current editor state
 * @returns The start position of the at-mention
 */
export function getAtMentionPosition(state: EditorState): number {
    const decoration = atMentionPluginKey.getState(state)?.decoration.find()[0]
    if (!decoration) {
        throw new Error('getAtMentionPosition called when at-mention is not active')
    }
    return decoration.from
}

/**
 * Sets the text value of the current at-mention. Leading '@' character is trimmed if present.
 * @param state The current editor state
 * @param value The new value of the at-mention
 * @returns The start position of the at-mention
 */
export function setAtMentionValue(state: EditorState, value: string): Transaction {
    const decoration = atMentionPluginKey.getState(state)?.decoration.find()[0]
    if (!decoration) {
        throw new Error('setMentionValue called when at-mention is not active')
    }
    if (value.length === 0) {
        // Special case that requires a deletion operation
        return state.tr.delete(decoration.from + 1, decoration.to)
    }
    if (value.startsWith(AT_MENTION_TRIGGER_CHARACTER)) {
        value = value.slice(1)
    }
    return state.tr.replaceWith(decoration.from + 1, decoration.to, state.schema.text(value))
}

function getDecoration(state: EditorState): Decoration | undefined {
    return atMentionPluginKey.getState(state)?.decoration.find()[0]
}

/**
 * Given the current at-mention value, this function returns whether
 * the at-mention should be considered 'closed'.
 * This is currently the case when the at-mention ends with three or more spaces.
 */
function shouldRemoveAtMention(mentionValue: string): boolean {
    return /\s{3,}$/.test(mentionValue)
}
