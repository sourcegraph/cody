package com.sourcegraph.cody.context.ui

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.ui.ToolbarDecorator
import com.sourcegraph.common.CodyBundle

class HelpButton :
    ToolbarDecorator.ElementActionButton(
        CodyBundle.getString("context-panel.help-button-name"), AllIcons.Actions.Help) {
  override fun actionPerformed(p0: AnActionEvent) {
    BrowserUtil.open("https://docs.sourcegraph.com/cody/core-concepts/keyword-search")
  }

  override fun isDumbAware(): Boolean = true
}
