package com.sourcegraph.cody.listeners

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.editor.event.BulkAwareDocumentListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.CompletionItemParams
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.autocomplete.action.AcceptCodyAutocompleteAction
import com.sourcegraph.cody.chat.CodeEditorFactory
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import com.sourcegraph.telemetry.GraphQlLogger
import com.sourcegraph.utils.CodyEditorUtil

class CodyDocumentListener(val project: Project) : BulkAwareDocumentListener {

  private fun logCodeCopyPastedFromChat(event: DocumentEvent) {
    val pastedCode = event.newFragment.toString()
    if (pastedCode.isNotBlank() && CodeEditorFactory.lastCopiedText == pastedCode) {
      CodeEditorFactory.lastCopiedText = null
      ApplicationManager.getApplication().executeOnPooledThread {
        GraphQlLogger.logCodeGenerationEvent(project, "keyDown:Paste", "clicked", pastedCode)
      }
    }
  }

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
    val editor = FileEditorManager.getInstance(project).selectedTextEditor
    if (editor?.document != event.document) {
      return
    }

    logCodeCopyPastedFromChat(event)
    CodyAutocompleteManager.instance.clearAutocompleteSuggestions(editor)

    if (CodyEditorUtil.isImplicitAutocompleteEnabledForEditor(editor) &&
        CodyEditorUtil.isEditorValidForAutocomplete(editor) &&
        !CommandProcessor.getInstance().isUndoTransparentActionInProgress) {

      ProtocolTextDocument.fromEditor(editor)?.let { textDocument ->
        CodyAgentService.withAgent(project) { agent ->
          agent.server.textDocumentDidChange(textDocument)

          // This notification must be sent after the above, see tracker comment for more
          // details.
          AcceptCodyAutocompleteAction.tracker.getAndSet(null)?.let { completionID ->
            agent.server.completionAccepted(CompletionItemParams(completionID))
            agent.server.autocompleteClearLastCandidate()
          }
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
