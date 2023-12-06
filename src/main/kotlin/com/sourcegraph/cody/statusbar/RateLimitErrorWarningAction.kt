package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.Messages
import com.sourcegraph.config.ConfigUtil

class RateLimitErrorWarningAction(
    actionText: String,
    private val dialogMessage: String,
    private val dialogTitle: String
) : DumbAwareAction(actionText) {
  override fun actionPerformed(e: AnActionEvent) {

    Messages.showDialog(
        e.project,
        dialogMessage,
        dialogTitle,
        arrayOf("Ok"),
        /* defaultOptionIndex= */ 0,
        Messages.getWarningIcon())
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isEnabledAndVisible = ConfigUtil.isCodyEnabled()
  }
}
