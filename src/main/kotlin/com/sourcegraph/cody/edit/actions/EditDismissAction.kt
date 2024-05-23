package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.edit.FixupService

// This differs from Cancel (and Undo) in a couple ways:
//
// - It doesn't send a message back to the server
// - If the edits are already applied, doesn't Undo
// - Useful outside the context of an active session
//
// So we have our own Action for it.
class EditDismissAction : InlineEditAction() {
  override fun performAction(e: AnActionEvent, project: Project) {
    FixupService.getInstance(project).getActiveSession()?.dispose()
  }
}
