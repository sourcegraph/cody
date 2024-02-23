package com.sourcegraph.cody.autocomplete

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.*
import com.intellij.openapi.editor.ex.util.EditorUtil
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileEditor.impl.FileEditorManagerImpl
import com.intellij.openapi.util.Disposer
import com.sourcegraph.cody.agent.CodyAgentCodebase
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.CompletionItemParams
import com.sourcegraph.cody.agent.protocol.Position
import com.sourcegraph.cody.agent.protocol.Range
import com.sourcegraph.cody.agent.protocol.TextDocument
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager.Companion.instance
import com.sourcegraph.cody.autocomplete.action.AcceptCodyAutocompleteAction
import com.sourcegraph.cody.chat.CodeEditorFactory
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import com.sourcegraph.config.ConfigUtil.isCodyEnabled
import com.sourcegraph.telemetry.GraphQlLogger
import com.sourcegraph.utils.CodyEditorUtil.VIM_EXIT_INSERT_MODE_ACTION
import com.sourcegraph.utils.CodyEditorUtil.isEditorValidForAutocomplete
import com.sourcegraph.utils.CodyEditorUtil.isImplicitAutocompleteEnabledForEditor

/**
 * Determines when to trigger completions and when to clear completions.
 *
 * IntelliJ doesn't have a built-in API to register "inline completion providers" similar to VS
 * Code. Instead, we manually listen to editor events like the caret position, selection changes,
 * and document edits.
 */
class CodyEditorFactoryListener : EditorFactoryListener {
  private var selectionListener = CodySelectionListener()
  private var caretListener: CaretListener = CodyCaretListener()

  override fun editorCreated(event: EditorFactoryEvent) {
    if (!isCodyEnabled()) {
      return
    }
    val editor = event.editor
    Util.informAgentAboutEditorChange(editor, hasFileChanged = true)
    val project = editor.project
    if (project == null || project.isDisposed) {
      return
    }
    val disposable = Disposer.newDisposable("CodyEditorFactoryListener")
    EditorUtil.disposeWithEditor(editor, disposable)
    editor.caretModel.addCaretListener(caretListener, disposable)
    editor.selectionModel.addSelectionListener(selectionListener, disposable)
    editor.document.addDocumentListener(CodyDocumentListener(editor), disposable)
  }

  private class CodyCaretListener : CaretListener {
    override fun caretPositionChanged(e: CaretEvent) {
      if (!isCodyEnabled()) {
        return
      }
      val commandName = CommandProcessor.getInstance().currentCommandName
      if (commandName == VIM_EXIT_INSERT_MODE_ACTION) {
        return
      }
      Util.informAgentAboutEditorChange(e.editor)
      val suggestions = instance
      val editor = e.editor
      if (isEditorValidForAutocomplete(editor) && Util.isSelectedEditor(editor)) {
        suggestions.clearAutocompleteSuggestions(e.editor)
        if (isImplicitAutocompleteEnabledForEditor(editor))
            suggestions.triggerAutocomplete(
                e.editor, e.editor.caretModel.offset, InlineCompletionTriggerKind.AUTOMATIC)
      }
    }
  }

  private class CodySelectionListener : SelectionListener {
    override fun selectionChanged(e: SelectionEvent) {
      if (!isCodyEnabled()) {
        return
      }
      val editor = e.editor
      Util.informAgentAboutEditorChange(editor)
      if (isEditorValidForAutocomplete(editor) && isCodyEnabled() && Util.isSelectedEditor(editor))
          instance.clearAutocompleteSuggestions(editor)
    }
  }

  private class CodyDocumentListener(private val editor: Editor) : BulkAwareDocumentListener {
    override fun documentChangedNonBulk(event: DocumentEvent) {
      if (!Util.isSelectedEditor(editor)) {
        return
      }
      val completions = instance
      completions.clearAutocompleteSuggestions(editor)
      if (isImplicitAutocompleteEnabledForEditor(editor) &&
          isEditorValidForAutocomplete(editor) &&
          !CommandProcessor.getInstance().isUndoTransparentActionInProgress) {
        Util.informAgentAboutEditorChange(editor)

        // This notification must be sent after the above, see tracker comment for more details.
        AcceptCodyAutocompleteAction.tracker.getAndSet(null)?.let { completionID ->
          editor.project?.let { project ->
            CodyAgentService.withAgent(project) { agent ->
              agent.server.completionAccepted(CompletionItemParams(completionID))
              agent.server.autocompleteClearLastCandidate()
            }
          }
        }

        val pastedCode = event.newFragment.toString()
        val project = editor.project
        if (project != null &&
            pastedCode.isNotBlank() &&
            CodeEditorFactory.lastCopiedText == pastedCode) {
          CodeEditorFactory.lastCopiedText = null
          ApplicationManager.getApplication().executeOnPooledThread {
            GraphQlLogger.logCodeGenerationEvent(project, "keyDown:Paste", "clicked", pastedCode)
          }
        }

        val changeOffset = event.offset + event.newLength
        if (editor.caretModel.offset == changeOffset) {
          completions.triggerAutocomplete(
              editor, changeOffset, InlineCompletionTriggerKind.AUTOMATIC)
        }
      }
    }
  }

  object Util {
    /**
     * Returns true if this editor is currently open and focused by the user. Returns true if this
     * editor is in a separate tab or not focused/selected by the user.
     */
    internal fun isSelectedEditor(editor: Editor?): Boolean {
      if (editor == null) {
        return false
      }
      val project = editor.project
      if (project == null || project.isDisposed) {
        return false
      }
      val editorManager = FileEditorManager.getInstance(project) ?: return false
      if (editorManager is FileEditorManagerImpl) {
        val current = editorManager.getSelectedTextEditor(true)
        return current != null && current == editor
      }
      val current = editorManager.selectedEditor
      return current is TextEditor && editor == current.editor
    }

    private fun getSelection(editor: Editor): Range? {
      val selectionModel = editor.selectionModel
      val selectionStartPosition =
          selectionModel.selectionStartPosition?.let { editor.visualToLogicalPosition(it) }
      val selectionEndPosition =
          selectionModel.selectionEndPosition?.let { editor.visualToLogicalPosition(it) }
      if (selectionStartPosition != null && selectionEndPosition != null) {
        return Range(
            Position(selectionStartPosition.line, selectionStartPosition.column),
            Position(selectionEndPosition.line, selectionEndPosition.column))
      }
      val carets = editor.caretModel.allCarets
      if (carets.isNotEmpty()) {
        val caret = carets[0]
        val position = Position(caret.logicalPosition.line, caret.logicalPosition.column)
        // A single-offset caret is a selection where end == start.
        return Range(position, position)
      }
      return null
    }

    // Sends a textDocument/didChange notification to the agent server.
    fun informAgentAboutEditorChange(
        editor: Editor,
        hasFileChanged: Boolean = false,
        afterUpdate: () -> Unit = {}
    ) {
      val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return
      val document = TextDocument.fromPath(file.path, editor.document.text, getSelection(editor))
      val project = editor.project ?: return

      if (hasFileChanged) {
        CodyAgentCodebase.getInstance(project).onFileOpened(project, file)
      }

      CodyAgentService.withAgent(project) {
        it.server.textDocumentDidOpen(document)
        afterUpdate()
      }
    }
  }
}
