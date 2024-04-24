package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.options.ShowSettingsUtil
import com.sourcegraph.cody.config.ui.CodyConfigurable
import com.sourcegraph.common.ui.DumbAwareBGTAction

class CodyOpenSettingsAction : DumbAwareBGTAction("Open Settings") {
  override fun actionPerformed(e: AnActionEvent) {
    ShowSettingsUtil.getInstance().showSettingsDialog(e.project, CodyConfigurable::class.java)
  }
}
