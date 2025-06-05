package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.diagnostic.Logger
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.edit.EditCommandPrompt

class EditCodeAction :
    BaseEditCodeAction({ editor ->
      val project = editor.project
      if (project != null) {
        CodyAgentService.withAgent(project) { agent -> agent.server.editTask_start(null) }
      } else {
        logger.warn("EditCodeAction invoked with null project")
      }
    }) {

  override fun update(event: AnActionEvent) {
    super.update(event)
    val eventEnabled = event.presentation.isEnabled
    val popupVisible = event.project?.let { EditCommandPrompt.isVisible(it) } === true
    // If the popup is visible, we let it handle the keybinding for the action.
    event.presentation.isEnabled = eventEnabled && !popupVisible
  }

  companion object {
    val logger = Logger.getInstance(EditCodeAction::class.java)
    const val ID: String = "cody.editCodeAction"
  }
}
