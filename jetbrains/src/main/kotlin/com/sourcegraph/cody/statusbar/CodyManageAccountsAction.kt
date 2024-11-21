package com.sourcegraph.cody.statusbar

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.options.ShowSettingsUtil
import com.sourcegraph.cody.config.ui.AccountConfigurable
import com.sourcegraph.common.ui.DumbAwareEDTAction

class CodyManageAccountsAction : DumbAwareEDTAction("Manage Accounts") {
  override fun actionPerformed(e: AnActionEvent) {
    ShowSettingsUtil.getInstance().showSettingsDialog(e.project, AccountConfigurable::class.java)
  }
}
