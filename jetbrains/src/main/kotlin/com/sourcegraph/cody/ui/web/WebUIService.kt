package com.sourcegraph.cody.ui.web

import com.google.gson.JsonParser
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.jetbrains.rd.util.AtomicReference
import com.jetbrains.rd.util.ConcurrentHashMap
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.agent.ConfigFeatures
import com.sourcegraph.cody.agent.CurrentConfigFeatures
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import com.sourcegraph.cody.agent.protocol.WebviewOptions
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
    // Handle the config message
    val decodedJson = JsonParser.parseString(stringEncodedJsonMessage).asJsonObject
    if (decodedJson.get("type")?.asString == "config") {
      val configFeatures = decodedJson.getAsJsonObject("configFeatures")
      val serverSentModels = configFeatures?.get("serverSentModels")?.asBoolean ?: false
      val currentConfigFeatures = project.service<CurrentConfigFeatures>()
      currentConfigFeatures.update(ConfigFeatures(serverSentModels = serverSentModels))
    }

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
            WebviewOptions(
                enableScripts = false,
                enableForms = false,
                enableCommandUris = false,
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
        CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshPanelsVisibility() }
        null
      }

  internal fun createWebviewPanel(params: WebviewCreateWebviewPanelParams) {
    runInEdt {
      val delegate = WebUIHostImpl(project, params.handle, params.options)
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

  internal fun setOptions(handle: String, options: WebviewOptions) {
    withProxy(handle) { it.setOptions(options) }
  }

  internal fun setTitle(handle: String, title: String) {
    withProxy(handle) { it.title = title }
  }

  override fun dispose() {}
}
