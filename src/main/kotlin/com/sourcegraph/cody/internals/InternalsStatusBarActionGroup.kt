package com.sourcegraph.cody.internals

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.sourcegraph.config.ConfigUtil

class InternalsStatusBarActionGroup : DefaultActionGroup() {
  override fun getActionUpdateThread(): ActionUpdateThread {
    return ActionUpdateThread.EDT
  }

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isVisible = ConfigUtil.isFeatureFlagEnabled("cody.feature.internals-menu")
    removeAll()
    if (e.project != null) {
      addAll(
          IgnoreOverrideAction(e.project!!),
      )
    }
  }
}
