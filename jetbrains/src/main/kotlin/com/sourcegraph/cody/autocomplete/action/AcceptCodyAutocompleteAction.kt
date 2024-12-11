package com.sourcegraph.cody.autocomplete.action

import com.intellij.openapi.editor.actionSystem.EditorAction
import java.util.concurrent.atomic.AtomicReference

/**
 * The action that gets triggered when the user accepts a Cody completion.
 *
 * The action works by reading the Inlay at the caret position and inserting the completion text
 * into the editor.
 */
object AcceptCodyAutocompleteAction : EditorAction(AcceptAutocompleteActionHandler()), CodyAction {
  // The tracker is used to keep track of the completion item that was accepted so that we can send
  // the completion-accepted notification AFTER we emit the document-change event. This is order
  // is expected by agent for certain telemetry events (not great, I know...).
  val tracker = AtomicReference<String>()
}
