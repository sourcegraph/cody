package com.sourcegraph.cody.internals

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.sourcegraph.cody.ui.BGTActionSetter
import com.sourcegraph.config.ConfigUtil

class InternalsStatusBarActionGroup : DefaultActionGroup() {
  init {
    BGTActionSetter.runUpdateOnBackgroundThread(this)
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
