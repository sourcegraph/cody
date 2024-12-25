import { Plugin, PluginKey, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

const placeholderPluginKey = new PluginKey<string>('placeholder')

/**
 * A plugin that adds a placeholder to the editor. The placeholder text will be set as
 * `data-placeholder` attribute on the editor's DOM element. Additional CSS is required to
 * make the placeholder visible.
 *
 * @example
 *  .editor[data-placeholder]::before {
 *      content: attr(data-placeholder);
 *      overflow: hidden;
 *      position: absolute;
 *      text-overflow: ellipsis;
 *      top: 0;
 *      left: 0;
 *      right: 5px;
 *      user-select: none;
 *      white-space: nowrap;
 *      display: inline-block;
 *      pointer-events: none;
 *  }
 */
export function placeholderPlugin(text: string): Plugin {
    const update = (view: EditorView) => {
        if (view.state.doc.childCount === 1 && view.state.doc.firstChild?.textContent === '') {
            view.dom.setAttribute('data-placeholder', placeholderPluginKey.getState(view.state) ?? '')
        } else {
            view.dom.removeAttribute('data-placeholder')
        }
    }

    return new Plugin<string>({
        key: placeholderPluginKey,
        state: {
            init() {
                return text
            },
            apply(tr, value) {
                if (tr.getMeta(placeholderPluginKey) !== undefined) {
                    return tr.getMeta(placeholderPluginKey)
                }
                return value
            },
        },
        view(view) {
            update(view)

            return { update }
        },
    })
}

/**
 * Modifies the provided transaction to update the placeholder text.
 * @param tr The transaction to modify
 * @param value The new placeholder text
 * @returns The modified transaction
 */
export function setPlaceholder(tr: Transaction, value: string): Transaction {
    return tr.setMeta(placeholderPluginKey, value)
}
