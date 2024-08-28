package com.sourcegraph.cody.ui

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.testFramework.LightVirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.ui.content.ContentFactory
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.CodyToolWindowContent.Companion.MAIN_PANEL
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.WebviewResolveWebviewViewParams
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.JComponent
import javax.swing.JPanel

class WebUIToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    WebviewViewService.getInstance(project).provideToolWindow(toolWindow)
  }
}

// vscode's package.json can give views a "name"; plugin.xml can't do that, so we
// consult this mapping of tool window IDs to default titles.
val defaultToolWindowTitles = mapOf("cody.chat" to "Cody")

interface WebviewViewDelegate {
  fun setTitle(newTitle: String)
}

interface WebviewHost {
  val id: String
  val viewDelegate: WebviewViewDelegate

  fun adopt(proxy: WebUIProxy)
}

class ToolWindowWebviewHost(private val toolWindow: ToolWindow) : WebviewHost {
  override val id: String = toolWindow.id

  override val viewDelegate =
      object : WebviewViewDelegate {
        override fun setTitle(newTitle: String) {
          runInEdt { toolWindow.stripeTitle = newTitle }
        }
        // TODO: Add icon support.
      }

  override fun adopt(proxy: WebUIProxy) {
    toolWindow.isAvailable = true
    val lockable = true
    val content =
        ContentFactory.SERVICE.getInstance().createContent(proxy.component, proxy.title, lockable)
    toolWindow.contentManager.addContent(content)
  }
}

class CodyToolWindowContentWebviewHost(
    private val owner: CodyToolWindowContent,
    val placeholder: JComponent
) : WebviewHost {
  override val id = "cody.chat"

  override val viewDelegate =
      object : WebviewViewDelegate {
        override fun setTitle(newTitle: String) {
          // No-op.
        }
      }

  override fun adopt(proxy: WebUIProxy) {
    runInEdt {
      owner.allContentPanel.remove(placeholder)
      owner.allContentPanel.add(proxy.component, MAIN_PANEL, CodyToolWindowContent.MAIN_PANEL_INDEX)
      owner.refreshPanelsVisibility()
    }
  }
}

// Responsibilities:
// - Rendezvous between ToolWindows implementing "Views" (Tool Windows in JetBrains), and
// WebviewViews.
@Service(Service.Level.PROJECT)
class WebviewViewService(val project: Project) {
  // Map of "view ID" to a host.
  private val views: MutableMap<String, WebviewHost> = mutableMapOf()
  private val providers: MutableMap<String, Provider> = mutableMapOf()

  data class Provider(
      val id: String,
      val options: ProviderOptions,
  )

  data class ProviderOptions(
      val retainContextWhenHidden: Boolean,
  )

  fun registerProvider(id: String, retainContextWhenHidden: Boolean) {
    var provider = Provider(id, ProviderOptions(retainContextWhenHidden))
    providers[id] = provider
    val viewHost = views[id] ?: return
    runInEdt { provideView(viewHost, provider) }
  }

  // TODO: Implement 'dispose' for registerWebviewViewProvider.

  private fun provideHost(viewHost: WebviewHost) {
    views[viewHost.id] = viewHost
    val provider = providers[viewHost.id] ?: return
    runInEdt { provideView(viewHost, provider) }
  }

  fun provideToolWindow(toolWindow: ToolWindow) {
    toolWindow.stripeTitle = defaultToolWindowTitles[toolWindow.id] ?: toolWindow.id
    provideHost(ToolWindowWebviewHost(toolWindow))
  }

  fun provideCodyToolWindowContent(codyContent: CodyToolWindowContent) {
    // Because the webview may be created lazily, populate a placeholder control.
    val placeholder = JPanel(GridBagLayout())
    val spinnerLabel =
        JBLabel("Starting Cody...", Icons.StatusBar.CompletionInProgress, JBLabel.CENTER)
    placeholder.add(spinnerLabel, GridBagConstraints())

    codyContent.allContentPanel.add(placeholder, MAIN_PANEL, CodyToolWindowContent.MAIN_PANEL_INDEX)
    provideHost(CodyToolWindowContentWebviewHost(codyContent, placeholder))
  }

  private fun provideView(viewHost: WebviewHost, provider: Provider) {
    val handle = "native-webview-view-${viewHost.id}"
    WebUIService.getInstance(project).createWebviewView(handle) { proxy ->
      viewHost.adopt(proxy)
      return@createWebviewView viewHost.viewDelegate
    }

    CodyAgentService.withAgent(project) {
      // TODO: https://code.visualstudio.com/api/references/vscode-api#WebviewViewProvider
      it.server.webviewResolveWebviewView(
          WebviewResolveWebviewViewParams(viewId = provider.id, webviewHandle = handle))
    }
  }

  // TODO: Consider moving this to a separate class.
  fun createPanel(
      proxy: WebUIProxy,
      params: WebviewCreateWebviewPanelParams
  ): WebviewViewDelegate? {
    // TODO: Give these files unique names.
    val file = LightVirtualFile("Cody")
    file.fileType = WebPanelFileType.INSTANCE
    file.putUserData(WebPanelTabTitleProvider.WEB_PANEL_TITLE_KEY, params.title)
    file.putUserData(WebPanelEditor.WEB_UI_PROXY_KEY, proxy)
    // TODO: Hang onto this editor to dispose of it, etc.
    FileEditorManager.getInstance(project).openFile(file, !params.showOptions.preserveFocus)
    return object : WebviewViewDelegate {
      override fun setTitle(newTitle: String) {
        runInEdt {
          runWriteAction {
            file.rename(this, newTitle)
            // TODO: Need to ping... something... to update the NavBarPanel.
            // SYNC_RESET should do it but that his a heavy-handed approach.
          }
          file.putUserData(WebPanelTabTitleProvider.WEB_PANEL_TITLE_KEY, newTitle)
          FileEditorManager.getInstance(project).updateFilePresentation(file)
        }
      }
      // TODO: Add icon support.
    }
  }

  companion object {
    fun getInstance(project: Project): WebviewViewService {
      return project.service()
    }
  }
}
