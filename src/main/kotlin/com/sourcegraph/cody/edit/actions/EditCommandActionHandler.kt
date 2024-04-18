package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.utils.CodyEditorUtil

open class EditCommandActionHandler(val runAction: (Editor, FixupService) -> Unit) :
    EditorActionHandler() {
  private val logger = Logger.getInstance(EditCommandActionHandler::class.java)

  override fun isEnabledForCaret(editor: Editor, caret: Caret, dataContext: DataContext?): Boolean {
    return CodyEditorUtil.isEditorValidForAutocomplete(editor)
  }

  override fun doExecute(editor: Editor, where: Caret?, dataContext: DataContext?) {
    val project = editor.project
    if (project == null) {
      logger.warn("No project found, cannot run FixupService action for ${this.javaClass.name}")
    } else {
      runAction(editor, FixupService.getInstance(project))
    }
  }
}
