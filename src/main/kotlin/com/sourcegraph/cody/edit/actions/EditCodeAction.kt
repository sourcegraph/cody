package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.diagnostic.Logger
import com.sourcegraph.cody.agent.protocol_generated.EditTask
import com.sourcegraph.cody.edit.EditCommandPrompt
import java.util.concurrent.ConcurrentHashMap

class EditCodeAction :
    BaseEditCodeAction({ editor ->
      val project = editor.project
      if (project != null) {
        EditCommandPrompt(project, editor, "Edit Code with Cody")
        logger.warn("EditCodeAction invoked with null project")
      }
    }) {

  override fun update(event: AnActionEvent) {
    super.update(event)
    val commandPrompt = EditCommandPrompt.EDIT_COMMAND_PROMPT_KEY.get(event.project)
    event.presentation.isEnabledAndVisible = commandPrompt?.isVisible != true
  }

  companion object {
    val logger = Logger.getInstance(EditCodeAction::class.java)
    val completedEditTasks = ConcurrentHashMap<String, EditTask>()

    const val ID: String = "cody.editCodeAction"
  }
}
