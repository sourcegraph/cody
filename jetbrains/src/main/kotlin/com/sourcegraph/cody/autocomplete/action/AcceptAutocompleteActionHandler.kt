package com.sourcegraph.cody.autocomplete.action

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ScrollType
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteItem
import com.sourcegraph.utils.CodyEditorUtil

class AcceptAutocompleteActionHandler : AutocompleteActionHandler() {
  /**
   * Applies the autocomplete to the document at a caret: 1. Replaces the string between the caret
   * offset and its line end with the current completion 2. Moves the caret to the start and end
   * offsets with the completion text. If there are multiple carets, uses the first one. If there
   * are no completions at the caret, does nothing.
   */
  override fun doExecute(editor: Editor, maybeCaret: Caret?, dataContext: DataContext?) {
    val caret = maybeCaret ?: getSingleCaret(editor) ?: return
    val completionItem = getCurrentAutocompleteItem(caret) ?: return

    AcceptCodyAutocompleteAction.tracker.set(completionItem.id)
    WriteAction.run<RuntimeException> { applyInsertText(editor, caret, completionItem) }
  }

  companion object {

    private fun applyInsertText(editor: Editor, caret: Caret, completionItem: AutocompleteItem) {
      val document = editor.document
      val range = CodyEditorUtil.getTextRange(document, completionItem.range)
      document.replaceString(range.startOffset, range.endOffset, completionItem.insertText)
      caret.moveToOffset(range.startOffset + completionItem.insertText.length)
      editor.scrollingModel.scrollToCaret(ScrollType.MAKE_VISIBLE)
    }
  }
}
