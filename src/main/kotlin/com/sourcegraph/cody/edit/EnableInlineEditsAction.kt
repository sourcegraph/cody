package com.sourcegraph.cody.edit

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareToggleAction
import com.sourcegraph.cody.config.CodyApplicationSettings

class EnableInlineEditsAction : DumbAwareToggleAction() {
  override fun isSelected(e: AnActionEvent): Boolean {
    return CodyApplicationSettings.instance.isInlineEditionEnabled
  }

  override fun setSelected(e: AnActionEvent, state: Boolean) {
    CodyApplicationSettings.instance.isInlineEditionEnabled = state
  }
}
