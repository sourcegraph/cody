package com.sourcegraph.cody.ui.web

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.CodyToolWindowContent.Companion.MAIN_PANEL
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.WebviewResolveWebviewViewParams
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.JComponent
import javax.swing.JPanel

/// A view that can host a browser component.
private interface WebviewHost {
  /// The provider ID of this view.
  val id: String
  val viewDelegate: WebviewViewDelegate

  /// Adopts a Webview into this host.
  fun adopt(proxy: WebUIProxy)

  // Resets the webview host to its pre-adopted state.
  fun reset()
}

private class CodyToolWindowContentWebviewHost(
    private val owner: CodyToolWindowContent,
    val placeholder: JComponent
) : WebviewHost {
  override val id = "cody.chat"

  var proxy: WebUIProxy? = null

  override val viewDelegate =
      object : WebviewViewDelegate {
        override fun setTitle(newTitle: String) {
          // No-op.
        }
      }

  override fun adopt(proxy: WebUIProxy) {
    runInEdt {
      assert(this.proxy == null)
      this.proxy = proxy
      owner.allContentPanel.remove(placeholder)
      proxy.component?.let {
        owner.allContentPanel.add(it, MAIN_PANEL, CodyToolWindowContent.MAIN_PANEL_INDEX)
      }
      owner.refreshPanelsVisibility()
    }
  }

  override fun reset() {
    // TODO: Flip the tool window back to showing the placeholder, when we can remove the browser
    // component without causing an exception that the component is already disposed as it is
    // resized during remove.
    this.proxy = null
  }
}

// Responsibilities:
// - Rendezvous between ToolWindows implementing "Views" (Tool Windows in JetBrains), and
// WebviewViews.
internal class WebviewViewManager(private val project: Project) {
  // Map of "view ID" to a host.
  private val views: MutableMap<String, WebviewHost> = mutableMapOf()
  private val providers: MutableMap<String, Provider> = mutableMapOf()

  private data class Provider(
      val id: String,
      val options: ProviderOptions,
  )

  private data class ProviderOptions(
      val retainContextWhenHidden: Boolean,
  )

  fun reset() {
    val viewsToReset = mutableListOf<WebviewHost>()
    synchronized(providers) {
      viewsToReset.addAll(views.values)
      // We do not clear views here. The Tool Windows, etc. are still available, so we will re-adopt
      // new webviews into them after Agent restarts and sends new providers.
      providers.clear()
    }
    viewsToReset.forEach { it.reset() }
  }

  fun registerProvider(id: String, retainContextWhenHidden: Boolean) {
    val viewHost: WebviewHost
    val provider = Provider(id, ProviderOptions(retainContextWhenHidden))
    synchronized(providers) {
      providers[id] = provider
      viewHost = views[id] ?: return
    }
    runInEdt { provideView(viewHost, provider) }
  }

  // TODO: Implement 'dispose' for registerWebviewViewProvider.

  private fun provideHost(viewHost: WebviewHost) {
    val provider: Provider
    synchronized(providers) {
      views[viewHost.id] = viewHost
      provider = providers[viewHost.id] ?: return
    }
    runInEdt { provideView(viewHost, provider) }
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
}
