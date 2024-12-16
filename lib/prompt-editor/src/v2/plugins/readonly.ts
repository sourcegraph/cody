import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state'

const readonlyPluginKey = new PluginKey<boolean>('readonly')

/**
 * A plugin that disables the editor
 */
export function readonlyPlugin(initial = false) {
    return new Plugin<boolean>({
        key: readonlyPluginKey,
        state: {
            init() {
                return initial
            },
            apply(tr, value) {
                if (tr.getMeta(readonlyPluginKey) !== undefined) {
                    return tr.getMeta(readonlyPluginKey)
                }
                return value
            },
        },
    })
}

/**
 * Return true if the editor is read-only.
 */
export function isReadOnly(state: EditorState): boolean {
    return !!readonlyPluginKey.getState(state)
}

/**
 * Modifies the provided transaction to update the read-only state.
 * @param tr The transaction to modify
 * @param value The new read-only value
 * @returns The modified transaction
 */
export function setReadOnly(tr: Transaction, value: boolean): Transaction {
    return tr.setMeta(readonlyPluginKey, value)
}
