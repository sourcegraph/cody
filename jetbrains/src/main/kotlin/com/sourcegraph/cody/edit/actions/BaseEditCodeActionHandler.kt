package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.sourcegraph.utils.CodyEditorUtil

open class BaseEditCodeActionHandler(val runAction: (Editor) -> Unit) : EditorActionHandler() {
  override fun isEnabledForCaret(editor: Editor, caret: Caret, dataContext: DataContext?): Boolean {
    return CodyEditorUtil.isEditorValidForAutocomplete(editor)
  }

  override fun doExecute(editor: Editor, where: Caret?, dataContext: DataContext?) {
    runAction(editor)
  }
}
