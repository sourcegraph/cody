package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.edit.FixupService

/**
 * Programmatically dispatches the key sequence for either opening the Edit Code dialog, or if the
 * Accept lens group is being displayed, delegating to the Accept action. Similarly, closes the
 * Error lens group if showing.
 */
class EditCancelOrUndoAction : InlineEditAction() {
  override fun performAction(e: AnActionEvent, project: Project) {
    val session = FixupService.getInstance(project).getActiveSession() ?: return
    when {
      session.isShowingAcceptLens() -> EditUndoAction().actionPerformed(e)
      session.isShowingErrorLens() -> EditDismissAction().actionPerformed(e)
      else -> EditCancelAction().actionPerformed(e)
    }
  }
}
