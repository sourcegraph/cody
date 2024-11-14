package com.sourcegraph.cody.ui.web

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Webview_ResolveWebviewViewParams

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

internal class CodyToolWindowContentWebviewHost(private val owner: CodyToolWindowContent) :
    WebviewHost {
  override val id = "cody.chat"

  var proxy: WebUIProxy? = null
    private set

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
      if (proxy.component == null) {
        thisLogger().warn("expected browser component to be created, but was null")
      }
      owner.setWebviewComponent(this)
    }
  }

  override fun reset() {
    owner.setWebviewComponent(null)
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
    provideHost(CodyToolWindowContentWebviewHost(codyContent))
  }

  private fun provideView(viewHost: WebviewHost, provider: Provider) {
    val handle = "native-webview-view-${viewHost.id}"
    WebUIService.getInstance(project).createWebviewView(handle) { proxy ->
      viewHost.adopt(proxy)
      return@createWebviewView viewHost.viewDelegate
    }

    CodyAgentService.withAgent(project) {
      // TODO: https://code.visualstudio.com/api/references/vscode-api#WebviewViewProvider
      it.server.webview_resolveWebviewView(
          Webview_ResolveWebviewViewParams(viewId = provider.id, webviewHandle = handle))
    }
  }
}
