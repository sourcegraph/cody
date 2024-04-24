package com.sourcegraph.cody.statusbar

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.common.ui.DumbAwareBGTAction

class ReportCodyBugAction : DumbAwareBGTAction("Open GitHub To Report Cody Issue") {
  override fun actionPerformed(p0: AnActionEvent) {
    BrowserUtil.open("https://github.com/sourcegraph/jetbrains/issues/new?template=bug_report.yml")
  }
}
