import { EditorView } from 'prosemirror-view';
import { Node } from 'prosemirror-model';

/**
 * Helper function to replace the current document in the editor with a new document.
 */
export function replaceDocument(view: EditorView, doc: Node): void {
    view.dispatch(
        view.state.tr.replaceWith(0, view.state.doc.nodeSize, doc)
    )
}
