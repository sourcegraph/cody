package com.sourcegraph.cody.autocomplete.action

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.autoedit.AutoeditManager

class DisposeAutocompleteSuggestionActionHandler : AutocompleteActionHandler() {
  override fun doExecute(editor: Editor, caret: Caret?, dataContext: DataContext?) {
    val project = editor.project ?: return
    CodyAutocompleteManager.getInstance(project).disposeInlays(editor)
    AutoeditManager.getInstance(project).hide()
  }
}
