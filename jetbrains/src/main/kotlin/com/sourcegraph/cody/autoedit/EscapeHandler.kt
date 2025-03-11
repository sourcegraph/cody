package com.sourcegraph.cody.autoedit

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler

class EscapeHandler(private val myOriginalHandler: EditorActionHandler) : EditorActionHandler() {
  override fun doExecute(editor: Editor, caret: Caret?, dataContext: DataContext?) {
    editor.project?.getService(AutoEditManager::class.java)?.hideAutoEdit()

    if (myOriginalHandler.isEnabled(editor, caret, dataContext)) {
      myOriginalHandler.execute(editor, caret, dataContext)
    }
  }

  public override fun isEnabledForCaret(
      editor: Editor,
      caret: Caret,
      dataContext: DataContext?
  ): Boolean {
    return true
  }
}
