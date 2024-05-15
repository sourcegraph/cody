package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Editor
import com.sourcegraph.cody.edit.FixupService

open class NonInteractiveEditCommandAction(runAction: (Editor, FixupService) -> Unit) :
    EditCommandAction(runAction) {
  override fun update(e: AnActionEvent) {
    super.update(e)

    val project = e.project ?: return
    e.presentation.isEnabled = !FixupService.getInstance(project).isEditInProgress()
  }
}
