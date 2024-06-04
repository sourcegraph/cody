package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Editor
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.common.CodyBundle

open class NonInteractiveEditCommandAction(runAction: (Editor, FixupService) -> Unit) :
    EditCommandAction(runAction) {
  override fun update(event: AnActionEvent) {
    super.update(event)

    val project = event.project ?: return
    val hasActiveAccount = CodyAuthenticationManager.getInstance(project).hasActiveAccount()
    event.presentation.isEnabled =
        hasActiveAccount && !FixupService.getInstance(project).isEditInProgress()
    if (!event.presentation.isEnabled) {
      event.presentation.description =
          CodyBundle.getString("action.sourcegraph.disabled.description")
    }
  }
}
