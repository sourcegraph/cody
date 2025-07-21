package com.sourcegraph.cody.autocomplete.action

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.autoedit.AutoeditManager

class DisposeAutocompleteSuggestionActionHandler(private val originalHandler: EditorActionHandler) :
    AutocompleteActionHandler() {
  override fun doExecute(editor: Editor, caret: Caret?, dataContext: DataContext?) {
    editor.project?.let {
      CodyAutocompleteManager.getInstance(it).disposeInlays(editor)
      AutoeditManager.getInstance(it).hide()
    }

    originalHandler.execute(editor, caret, dataContext)
  }

  override fun isEnabledForCaret(editor: Editor, caret: Caret, dataContext: DataContext?) =
      if (super.isEnabledForCaret(editor, caret, dataContext)) true
      else originalHandler.isEnabled(editor, caret, dataContext)
}
