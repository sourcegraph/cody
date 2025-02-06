package com.sourcegraph.cody.listeners

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.editor.event.BulkAwareDocumentListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.CompletionItemParams
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.autocomplete.action.AcceptCodyAutocompleteAction
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import com.sourcegraph.utils.CodyEditorUtil

class CodyDocumentListener(val project: Project) : BulkAwareDocumentListener {

  override fun documentChangedNonBulk(event: DocumentEvent) {
    try {
      // Can be called on non-EDT during IDE shutdown.
      runInEdt { handleDocumentEvent(event) }
    } catch (e: IllegalStateException) {
      // The error is thrown when a user opens the light bulb icon (from JetBrains).
      // This event is not relevant to Cody (is not a change to the document), so we ignore it.
      return
    }
  }

  private fun handleDocumentEvent(event: DocumentEvent) {
    val editor = CodyEditorUtil.getEditorForDocument(event.document) ?: return

    if (editor.project != project) {
      return
    }

    CodyAutocompleteManager.instance.clearAutocompleteSuggestions(editor)

    // IMPORTANT: we must do document synchronization even if autocomplete isn't auto-triggered.
    // This is esp. important with incremental document synchronization where the server goes out
    // of sync if it doesn't get all changes.

    ProtocolTextDocumentExt.fromEditorForDocumentEvent(editor, event)?.let { textDocument ->
      EditorChangesBus.documentChanged(project, textDocument)
      CodyAgentService.withAgent(project) { agent ->
        agent.server.textDocument_didChange(textDocument)

        // This notification must be sent after the above, see tracker comment for more
        // details.
        AcceptCodyAutocompleteAction.tracker.getAndSet(null)?.let { completionID ->
          agent.server.autocomplete_completionAccepted(CompletionItemParams(completionID))
          agent.server.autocomplete_clearLastCandidate(null)
        }
      }
      val changeOffset = event.offset + event.newLength
      if (editor.caretModel.offset == changeOffset) {
        CodyAutocompleteManager.instance.triggerAutocomplete(
            editor, changeOffset, InlineCompletionTriggerKind.AUTOMATIC)
      }
    }
  }
}
