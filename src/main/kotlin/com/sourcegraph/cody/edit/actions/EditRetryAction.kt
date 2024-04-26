package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.edit.FixupService

class EditRetryAction : InlineEditAction() {
  override fun performAction(e: AnActionEvent, project: Project) {
    FixupService.getInstance(project).getActiveSession()?.retry()
  }
}
