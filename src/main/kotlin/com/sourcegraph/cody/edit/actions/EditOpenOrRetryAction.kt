package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.edit.FixupService

/**
 * Programmatically dispatches the key sequence for either opening the Edit Code dialog, or if the
 * Accept lens group is being displayed, delegating to the Accept action.
 */
class EditOpenOrRetryAction : InlineEditAction() {
  override fun performAction(e: AnActionEvent, project: Project) {
    if (FixupService.getInstance(project).getActiveSession()?.isShowingAcceptLens() == true) {
      EditRetryAction().actionPerformed(e)
    } else {
      EditCodeAction().actionPerformed(e)
    }
  }
}
