package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.sourcegraph.cody.auth.CodyAuthService.Companion.getInstance
import com.sourcegraph.config.ConfigUtil.isCodyEnabled

class CodyActionGroup : DefaultActionGroup() {
  override fun getActionUpdateThread() = ActionUpdateThread.EDT

  override fun isDumbAware() = true

  override fun update(e: AnActionEvent) {
    super.update(e)

    val project = e.project
    e.presentation.isVisible =
        (isCodyEnabled() && project != null && getInstance(project).isActivated())
  }
}
