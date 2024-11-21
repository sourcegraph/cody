package com.sourcegraph.cody.auth.ui

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.config.CodyPersistentAccountsHost
import com.sourcegraph.cody.config.SourcegraphInstanceLoginDialog
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil

class SignInWithEnterpriseInstanceAction(
    private val defaultServer: String = ConfigUtil.DOTCOM_URL
) : DumbAwareEDTAction("Sign in with Sourcegraph") {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val accountsHost = CodyPersistentAccountsHost(project)
    val authManager = CodyAuthenticationManager.getInstance()
    val serverUrl = authManager.account?.server?.url ?: defaultServer
    val dialog =
        SourcegraphInstanceLoginDialog(
            project, e.getData(PlatformCoreDataKeys.CONTEXT_COMPONENT), serverUrl)
    if (dialog.showAndGet()) {
      accountsHost.addAccount(
          dialog.codyAuthData.server,
          dialog.codyAuthData.login,
          dialog.codyAuthData.account.displayName,
          dialog.codyAuthData.token,
          dialog.codyAuthData.account.id)
      if (ConfigUtil.isCodyEnabled()) {
        // Open Cody sidebar
        val toolWindowManager = ToolWindowManager.getInstance(project)
        val toolWindow = toolWindowManager.getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
        toolWindow?.setAvailable(true, null)
        toolWindow?.activate {}
      }
    }
  }

  companion object {
    // Make it wide enough to see a reasonable servername and token
    const val MIN_DIALOG_WIDTH = 600
    const val MIN_DIALOG_HEIGHT = 200
  }
}
