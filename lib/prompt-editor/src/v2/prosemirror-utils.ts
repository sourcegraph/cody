import { Node } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';

/**
 * Helper function to replace the current document in the editor with a new document.
 */
export function replaceDocument(state: EditorState, doc: Node): Transaction {
    return state.tr.replaceWith(0, state.doc.content.size, doc)
}
