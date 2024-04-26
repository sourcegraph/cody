package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project

// Until we decide which log to open, reusing the status bar action.
class EditOpenLogAction : InlineEditAction() {
  override fun performAction(e: AnActionEvent, project: Project) {}
}
