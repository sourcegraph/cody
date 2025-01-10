package com.sourcegraph.cody.edit.lenses.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.cody.edit.lenses.LensesService
import com.sourcegraph.common.CodyBundle

abstract class LensEditAction(val editAction: (Project, AnActionEvent, Editor, String) -> Unit) :
    AnAction(), DumbAware {
  private val logger = Logger.getInstance(LensEditAction::class.java)

  override fun getActionUpdateThread(): ActionUpdateThread {
    return ActionUpdateThread.EDT
  }

  override fun update(event: AnActionEvent) {
    val project = event.project
    event.presentation.isEnabled =
        project != null && CodyAuthService.getInstance(project).isActivated()
    if (!event.presentation.isEnabled) {
      event.presentation.description =
          CodyBundle.getString("action.sourcegraph.disabled.description")
    }
  }

  override fun actionPerformed(e: AnActionEvent) {
    try {
      var project = e.project
      if (project == null) {
        project = e.dataContext.getData(PlatformDataKeys.PROJECT.name) as? Project
      }
      if (project == null || project.isDisposed) {
        logger.warn("Received code lens action for null or disposed project: $e")
        return
      }

      val editor = e.dataContext.getData(PlatformDataKeys.EDITOR)
      if (editor == null || editor.isDisposed) {
        logger.warn("Received code lens action for null or disposed editor: $e")
        return
      }

      val taskId =
          e.dataContext.getData(TASK_ID_KEY)
              ?: LensesService.getInstance(project).getTaskIdsOfFirstVisibleLens(editor)
              ?: run {
                logger.warn("No taskId found in data context for action ${this.javaClass.name}: $e")
                return
              }

      editAction(project, e, editor, taskId)
    } catch (ex: Exception) {
      // Don't show error lens here; it's sort of pointless.
      logger.warn("Error accepting edit accept task: $ex")
    }
  }

  companion object {
    val TASK_ID_KEY: DataKey<String> = DataKey.create("TASK_ID_KEY")
  }
}
