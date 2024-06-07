package com.sourcegraph.cody.statusbar

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.cody.error.CodyErrorSubmitter
import com.sourcegraph.common.ui.DumbAwareEDTAction

class ReportCodyBugAction : DumbAwareEDTAction("Open GitHub To Report Cody Issue") {
  override fun actionPerformed(event: AnActionEvent) {
    BrowserUtil.open(CodyErrorSubmitter().getEncodedUrl(event.project))
  }
}
