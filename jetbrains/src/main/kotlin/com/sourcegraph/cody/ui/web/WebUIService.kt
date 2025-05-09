package com.sourcegraph.cody.ui.web

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.jetbrains.rd.util.AtomicReference
import com.jetbrains.rd.util.ConcurrentHashMap
import com.sourcegraph.cody.agent.protocol_generated.DefiniteWebviewOptions
import com.sourcegraph.cody.agent.protocol_generated.Webview_CreateWebviewPanelParams
import com.sourcegraph.cody.sidebar.WebTheme
import com.sourcegraph.cody.sidebar.WebThemeController
import java.util.concurrent.CompletableFuture
import java.util.concurrent.locks.Condition
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

internal data class WebUIProxyCreationGate(
    val lock: ReentrantLock,
    val createdCondition: Condition,
    var proxy: WebUIProxy?
)

// Responsibilities:
// - Creates, tracks all Webview Views and panels.
// - Pushes theme updates into Webviews.
// - Routes postMessage from host to Webviews.
@Service(Service.Level.PROJECT)
class WebUIService(private val project: Project) : Disposable {
  companion object {
    @JvmStatic fun getInstance(project: Project): WebUIService = project.service<WebUIService>()
  }

  private val logger = Logger.getInstance(WebUIService::class.java)
  private val proxies: ConcurrentHashMap<String, WebUIProxyCreationGate> = ConcurrentHashMap()
  internal val panels = WebviewPanelManager(project)
  internal val views = WebviewViewManager(project)

  fun reset(): CompletableFuture<Void> {
    proxies.clear()
    views.reset()
    return panels.reset()
  }

  val proxyCreationException = AtomicReference<IllegalStateException?>(null)

  private fun <T> withCreationGate(name: String, action: (gate: WebUIProxyCreationGate) -> T): T {
    val gate =
        proxies.computeIfAbsent(name) {
          val lock = ReentrantLock()
          WebUIProxyCreationGate(lock, lock.newCondition(), null)
        }
    return gate.lock.withLock {
      return@withLock action(gate)
    }
  }

  private fun <T> withProxy(name: String, action: (proxy: WebUIProxy) -> T): T =
      withCreationGate(name) { gate ->
        gate.lock.withLock {
          var proxy = gate.proxy
          if (proxy == null) {
            logger.info(
                "parking thread ${Thread.currentThread().name} waiting for Webview proxy $name to be created")
            do {
              gate.createdCondition.await()
              proxy = gate.proxy
            } while (proxy == null)
            logger.info(
                "unparked thread ${Thread.currentThread().name}, Webview proxy $name has been created")
          }
          return@withLock action(proxy)
        }
      }

  private val themeController =
      WebThemeController(this).apply { setThemeChangeListener { updateTheme(it) } }

  private fun updateTheme(theme: WebTheme) {
    synchronized(proxies) {
      proxies.values.forEach { it.lock.withLock { it.proxy?.updateTheme(theme) } }
    }
  }

  internal fun postMessageHostToWebview(handle: String, stringEncodedJsonMessage: String) {
    withProxy(handle) { it.postMessageHostToWebview(stringEncodedJsonMessage) }
  }

  internal fun createWebviewView(
      handle: String,
      createView: (proxy: WebUIProxy) -> WebviewViewDelegate
  ) {
    val delegate =
        WebUIHostImpl(
            project,
            handle,
            DefiniteWebviewOptions(
                enableScripts = false,
                enableForms = false,
                enableOnlyCommandUris = null,
                localResourceRoots = emptyList(),
                portMapping = emptyList(),
                enableFindWidget = false,
                retainContextWhenHidden = false))

    val proxy = createWebUIProxy(delegate) ?: return
    delegate.view = createView(proxy)
    proxy.updateTheme(themeController.getTheme())
    withCreationGate(handle) {
      assert(it.proxy == null) { "Webview Views should be created at most once by the client" }
      it.proxy = proxy
      it.createdCondition.signalAll()
    }
  }

  private fun createWebUIProxy(delegate: WebUIHost): WebUIProxy? =
      try {
        proxyCreationException.getAndSet(null)
        WebUIProxy.create(delegate)
      } catch (e: IllegalStateException) {
        proxyCreationException.getAndSet(e)
        null
      }

  internal fun createWebviewPanel(params: Webview_CreateWebviewPanelParams) {
    runInEdt {
      val delegate =
          WebUIHostImpl(
              project,
              params.handle,
              DefiniteWebviewOptions(
                  enableScripts = params.options.enableScripts,
                  enableForms = params.options.enableForms,
                  enableOnlyCommandUris = params.options.enableOnlyCommandUris,
                  localResourceRoots = params.options.localResourceRoots,
                  portMapping = params.options.portMapping,
                  enableFindWidget = params.options.enableFindWidget,
                  retainContextWhenHidden = params.options.retainContextWhenHidden))
      val proxy = WebUIProxy.create(delegate)
      delegate.view = panels.createPanel(proxy, params)
      proxy.updateTheme(themeController.getTheme())
      withCreationGate(params.handle) {
        assert(it.proxy == null) {
          "Webview Panels should have unique names, have already created ${params.handle}"
        }
        it.proxy = proxy
        it.createdCondition.signalAll()
      }
    }
  }

  internal fun setHtml(handle: String, html: String) {
    withProxy(handle) { it.html = html }
  }

  internal fun setOptions(handle: String, options: DefiniteWebviewOptions) {
    withProxy(handle) { it.setOptions(options) }
  }

  internal fun setTitle(handle: String, title: String) {
    withProxy(handle) { it.title = title }
  }

  override fun dispose() {}
}
