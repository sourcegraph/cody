package com.sourcegraph.cody.config.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareToggleAction
import com.sourcegraph.cody.config.CodyApplicationSettings

class EnableOffScreenRenderingAction : DumbAwareToggleAction() {
  override fun isSelected(e: AnActionEvent): Boolean {
    return CodyApplicationSettings.instance.isOffScreenRenderingEnabled
  }

  override fun setSelected(e: AnActionEvent, state: Boolean) {
    CodyApplicationSettings.instance.isOffScreenRenderingEnabled = state
  }

  override fun getActionUpdateThread(): ActionUpdateThread {
    return ActionUpdateThread.BGT
  }
}
