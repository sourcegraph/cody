package com.sourcegraph.cody.edit.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.common.CodyBundle

abstract class InlineEditAction : AnAction(), DumbAware {
  private val logger = Logger.getInstance(InlineEditAction::class.java)

  override fun update(event: AnActionEvent) {
    val project = event.project ?: return
    val hasActiveAccount = CodyAuthenticationManager.getInstance(project).hasActiveAccount()
    event.presentation.isEnabled = hasActiveAccount
    if (!event.presentation.isEnabled) {
      event.presentation.description =
          CodyBundle.getString("action.sourcegraph.disabled.description")
    }
  }

  abstract fun performAction(e: AnActionEvent, project: Project)

  override fun actionPerformed(e: AnActionEvent) {
    var project = e.project
    if (project == null) {
      project = e.dataContext.getData(PlatformDataKeys.PROJECT.name) as? Project
    }
    if (project == null || project.isDisposed) {
      logger.warn("Received code lens action for null or disposed project: $e")
      return
    }
    performAction(e, project)
  }
}
