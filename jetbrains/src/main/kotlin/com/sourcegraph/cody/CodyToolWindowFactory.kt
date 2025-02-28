package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.sourcegraph.cody.CodyToolWindowContent.Companion.executeOnInstanceIfNotDisposed
import com.sourcegraph.cody.config.actions.OpenCodySettingsEditorAction
import com.sourcegraph.cody.ui.web.WebUIService.Companion.getInstance
import com.sourcegraph.config.ConfigUtil.isCodyEnabled
import com.sourcegraph.config.ConfigUtil.isFeatureFlagEnabled

class CodyToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    executeOnInstanceIfNotDisposed(project) {
      val content = ContentFactory.getInstance().createContent(allContentPanel, "", false)
      content.preferredFocusableComponent = allContentPanel
      toolWindow.contentManager.addContent(content)
      val customCodySettings = DefaultActionGroup()
      customCodySettings.add(OpenCodySettingsEditorAction())
      customCodySettings.addSeparator()

      if (isFeatureFlagEnabled("cody.feature.internals-menu")) {
        customCodySettings.add(OpenWebviewDevToolsAction(this))
      }

      toolWindow.setAdditionalGearActions(customCodySettings)

      getInstance(project).views.provideCodyToolWindowContent(this)
    }
  }

  override fun shouldBeAvailable(project: Project) = isCodyEnabled()

  companion object {
    const val TOOL_WINDOW_ID: String = "Cody"
  }
}
