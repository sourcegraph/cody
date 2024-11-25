package com.sourcegraph.cody

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.components.JBLabel
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.chat.ui.ErrorPanel
import com.sourcegraph.cody.chat.ui.MissingJcefPanel
import com.sourcegraph.cody.initialization.VerifyJavaBootRuntimeVersion.Companion.isCurrentRuntimeMissingJcef
import com.sourcegraph.cody.ui.web.CodyToolWindowContentWebviewHost
import com.sourcegraph.cody.ui.web.WebUIService
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.GridLayout
import javax.swing.JComponent
import javax.swing.JPanel

@Service(Service.Level.PROJECT)
class CodyToolWindowContent(val project: Project) {
  val allContentPanel: JComponent = JPanel(GridLayout(1, 1))
  private var webview: CodyToolWindowContentWebviewHost? = null

  init {
    // Because the webview may be created lazily, populate a placeholder control.
    val spinnerPlaceholder = JPanel(GridBagLayout())
    val spinnerLabel =
        JBLabel("Starting Cody...", Icons.StatusBar.CompletionInProgress, JBLabel.CENTER)
    spinnerPlaceholder.add(spinnerLabel, GridBagConstraints())
    allContentPanel.add(spinnerLabel, GridBagConstraints())

    refreshPanelsVisibility()
  }

  @RequiresEdt
  fun refreshPanelsVisibility() {
    val errorOnProxyCreation = WebUIService.getInstance(project).proxyCreationException.get()
    if (errorOnProxyCreation == null) {
      webview?.proxy?.component?.let { showView(it) }
    } else {
      if (isCurrentRuntimeMissingJcef()) {
        showView(MissingJcefPanel())
      } else {
        showView(ErrorPanel())
        logger.error(errorOnProxyCreation)
      }
    }
  }

  private fun showView(component: JComponent) {
    if (allContentPanel.components.isEmpty() || allContentPanel.getComponent(0) != component) {
      allContentPanel.removeAll()
      allContentPanel.add(component)
    }
  }

  internal fun setWebviewComponent(host: CodyToolWindowContentWebviewHost?) {
    webview = host
    if (host != null && host.proxy?.component == null) {
      logger.warn("expected browser component to be created, but was null")
    }
    refreshPanelsVisibility()
  }

  fun openDevTools() {
    webview?.proxy?.openDevTools()
  }

  companion object {
    var logger = Logger.getInstance(CodyToolWindowContent::class.java)

    fun show(project: Project) {
      ToolWindowManager.getInstance(project)
          .getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
          ?.show()
    }

    fun executeOnInstanceIfNotDisposed(
        project: Project,
        myAction: CodyToolWindowContent.() -> Unit
    ) {
      UIUtil.invokeLaterIfNeeded {
        if (!project.isDisposed) {
          val codyToolWindowContent = project.getService(CodyToolWindowContent::class.java)
          codyToolWindowContent.myAction()
        }
      }
    }
  }
}
