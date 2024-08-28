package com.sourcegraph.cody.ui

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonParser
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefBrowserBuilder
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.io.isAncestor
import com.jetbrains.rd.util.ConcurrentHashMap
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.CommandExecuteParams
import com.sourcegraph.cody.agent.ConfigFeatures
import com.sourcegraph.cody.agent.CurrentConfigFeatures
import com.sourcegraph.cody.agent.WebviewDidDisposeParams
import com.sourcegraph.cody.agent.WebviewPostMessageStringEncodedParams
import com.sourcegraph.cody.agent.WebviewReceiveMessageStringEncodedParams
import com.sourcegraph.cody.agent.WebviewRegisterWebviewViewProviderParams
import com.sourcegraph.cody.agent.WebviewSetHtmlParams
import com.sourcegraph.cody.agent.WebviewSetOptionsParams
import com.sourcegraph.cody.agent.WebviewSetTitleParams
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import com.sourcegraph.cody.agent.protocol.WebviewOptions
import com.sourcegraph.cody.chat.actions.ExportChatsAction.Companion.gson
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.config.ui.CodyConfigurable
import com.sourcegraph.cody.sidebar.WebTheme
import com.sourcegraph.cody.sidebar.WebThemeController
import com.sourcegraph.common.BrowserOpener
import java.awt.Component
import java.awt.datatransfer.StringSelection
import java.io.IOException
import java.net.URI
import java.net.URLDecoder
import java.nio.ByteBuffer
import java.nio.channels.AsynchronousFileChannel
import java.nio.channels.CompletionHandler
import java.nio.charset.StandardCharsets
import java.nio.file.StandardOpenOption
import java.util.concurrent.locks.Condition
import java.util.concurrent.locks.ReentrantLock
import javax.swing.JComponent
import kotlin.concurrent.withLock
import kotlin.io.path.Path
import kotlin.math.min
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefAuthCallback
import org.cef.callback.CefCallback
import org.cef.handler.CefCookieAccessFilter
import org.cef.handler.CefFocusHandler
import org.cef.handler.CefFocusHandlerAdapter
import org.cef.handler.CefLifeSpanHandler
import org.cef.handler.CefLoadHandler
import org.cef.handler.CefRequestHandler
import org.cef.handler.CefResourceHandler
import org.cef.handler.CefResourceRequestHandler
import org.cef.misc.BoolRef
import org.cef.misc.IntRef
import org.cef.misc.StringRef
import org.cef.network.CefCookie
import org.cef.network.CefRequest
import org.cef.network.CefResponse
import org.cef.network.CefURLRequest
import org.cef.security.CefSSLInfo

/** The subset of the Agent client interface that relates to webviews. */
interface NativeWebviewProvider {
  fun createPanel(params: WebviewCreateWebviewPanelParams)

  fun receivedPostMessage(params: WebviewPostMessageStringEncodedParams)

  fun registerViewProvider(params: WebviewRegisterWebviewViewProviderParams)

  fun setHtml(params: WebviewSetHtmlParams)

  fun setOptions(params: WebviewSetOptionsParams)

  fun setTitle(params: WebviewSetTitleParams)
}

/** A NativeWebviewProvider that thanks to WebUIService. */
class WebUIServiceWebviewProvider(val project: Project) : NativeWebviewProvider {
  override fun createPanel(params: WebviewCreateWebviewPanelParams) =
      WebUIService.getInstance(project).createWebviewPanel(params)

  override fun receivedPostMessage(params: WebviewPostMessageStringEncodedParams) =
      WebUIService.getInstance(project)
          .postMessageHostToWebview(params.id, params.stringEncodedMessage)

  override fun registerViewProvider(params: WebviewRegisterWebviewViewProviderParams) =
      WebviewViewService.getInstance(project)
          .registerProvider(params.viewId, params.retainContextWhenHidden)

  override fun setHtml(params: WebviewSetHtmlParams) =
      WebUIService.getInstance(project).setHtml(params.handle, params.html)

  override fun setOptions(params: WebviewSetOptionsParams) =
      WebUIService.getInstance(project).setOptions(params.handle, params.options)

  override fun setTitle(params: WebviewSetTitleParams) =
      WebUIService.getInstance(project).setTitle(params.handle, params.title)
}

data class WebUIProxyCreationGate(
    val lock: ReentrantLock,
    val createdCondition: Condition,
    var proxy: WebUIProxy?
)

// Responsibilities:
// - Creates, tracks all WebUI instances.
// - Pushes theme updates into WebUI instances.
// - Routes messages from host to WebUI instances.
@Service(Service.Level.PROJECT)
class WebUIService(private val project: Project) {
  companion object {
    // TODO: If not disposed, etc.
    @JvmStatic fun getInstance(project: Project): WebUIService = project.service<WebUIService>()
  }

  private val logger = Logger.getInstance(WebUIService::class.java)
  private val proxies: ConcurrentHashMap<String, WebUIProxyCreationGate> = ConcurrentHashMap()

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

  private var themeController =
      WebThemeController().apply { setThemeChangeListener { updateTheme(it) } }

  private fun updateTheme(theme: WebTheme) {
    synchronized(proxies) {
      proxies.values.forEach { it.lock.withLock { it.proxy?.updateTheme(theme) } }
    }
  }

  fun postMessageHostToWebview(handle: String, stringEncodedJsonMessage: String) {
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

  fun createWebviewView(handle: String, createView: (proxy: WebUIProxy) -> WebviewViewDelegate) {
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
    val proxy = WebUIProxy.create(delegate)
    delegate.view = createView(proxy)
    proxy.updateTheme(themeController.getTheme())
    withCreationGate(handle) {
      assert(it.proxy == null) { "Webview Views should be created at most once by the client" }
      it.proxy = proxy
      it.createdCondition.signalAll()
    }
  }

  fun createWebviewPanel(params: WebviewCreateWebviewPanelParams) {
    runInEdt {
      val delegate = WebUIHostImpl(project, params.handle, params.options)
      val proxy = WebUIProxy.create(delegate)
      delegate.view = WebviewViewService.getInstance(project).createPanel(proxy, params)
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

  fun setHtml(handle: String, html: String) {
    withProxy(handle) { it.html = html }
  }

  fun setOptions(handle: String, options: WebviewOptions) {
    withProxy(handle) { it.setOptions(options) }
  }

  fun setTitle(handle: String, title: String) {
    withProxy(handle) { it.title = title }
  }
}

const val COMMAND_PREFIX = "command:"

// We make up a host name and serve the static resources into the webview apparently from this host.
const val PSEUDO_HOST = "file+.sourcegraphstatic.com"
const val PSEUDO_ORIGIN = "https://$PSEUDO_HOST"
const val PSEUDO_HOST_URL_PREFIX = "$PSEUDO_ORIGIN/"
const val MAIN_RESOURCE_URL = "${PSEUDO_HOST_URL_PREFIX}main-resource-nonce"

// TODO:
// - Use UiNotifyConnector to hook up visibility and push changes to
// WebviewPanel.visible/WebviewView.visible and fire onDidChangeViewState (panels) or
// onDidChangeVisibility (views)
// - Use ??? to hook up focus and push changes to WebviewPanel.active and fire onDidChangeViewState
// - Hook up webview/didDispose, etc.
// - Implement registerWebviewPanelSerializer and wire it to JetBrains panel saving to restore chats
// when JetBrains is reopened.
// - Implement enableFindDialog/ctrl-f find in page.

interface WebUIHost {
  // Provides, sinks Webview state from VSCode webview setState, getState API.
  abstract var stateAsJSONString: String

  fun setOptions(options: WebviewOptions)

  fun setTitle(value: String)

  fun postMessageWebviewToHost(stringEncodedJsonMessage: String)

  fun onCommand(command: String)

  fun dispose()
}

class WebUIHostImpl(
    val project: Project,
    val handle: String,
    private var _options: WebviewOptions
) : WebUIHost {
  var view: WebviewViewDelegate? = null

  override var stateAsJSONString = "null"

  override fun postMessageWebviewToHost(stringEncodedJsonMessage: String) {
    // Some commands can be handled by the client and do not need to round-trip client -> Agent ->
    // client.
    val stringsOfInterest = listOf("auth", "command")
    val decodedJson =
        if (stringsOfInterest.any { stringEncodedJsonMessage.contains(it) }) {
          JsonParser.parseString(stringEncodedJsonMessage).asJsonObject
        } else {
          null
        }

    val command = decodedJson?.get("command")?.asString
    val isCommand = command == "command"
    val id = decodedJson?.get("id")?.asString
    val arg = decodedJson?.get("arg")?.asString

    if (command == "auth") {
      val authKind = decodedJson.get("authKind")?.asString
      if (authKind == "signout") {
        CodyAuthenticationManager.getInstance(project).setActiveAccount(null)
      }
    } else if (isCommand && id == "cody.action.command" && arg == "edit") {
      // TODO: Delete this intercept when Cody edits UI is abstracted so JetBrains' native UI can be
      // invoked from the extension TypeScript side through Agent.
      runInEdt {
        // Invoke the Cody "edit" action in JetBrains directly.
        val actionManager = ActionManager.getInstance()
        val action = actionManager.getAction("cody.editCodeAction")
        val dataContext =
            FileEditorManager.getInstance(project).selectedTextEditor?.let { editor ->
              SimpleDataContext.getSimpleContext(CommonDataKeys.EDITOR, editor)
            } ?: SimpleDataContext.EMPTY_CONTEXT

        action?.actionPerformed(AnActionEvent.createFromAnAction(action, null, "", dataContext))
      }
    } else if (isCommand && id == "cody.status-bar.interacted") {
      runInEdt {
        ShowSettingsUtil.getInstance().showSettingsDialog(project, CodyConfigurable::class.java)
      }
    } else {
      CodyAgentService.withAgent(project) {
        it.server.webviewReceiveMessageStringEncoded(
            WebviewReceiveMessageStringEncodedParams(handle, stringEncodedJsonMessage))
      }
    }
  }

  override fun setOptions(options: WebviewOptions) {
    // TODO:
    // When TypeScript uses these WebView options, implement them:
    // - retainContextWhenHidden: false and dispose the browser when hidden.
    // - localResourceRoots beyond just the extension distribution path.
    // - Non-empty portMapping.
    // - enableScripts: false, enableForms: false
    _options = options
  }

  override fun setTitle(value: String) {
    view?.setTitle(value)
  }

  override fun onCommand(command: String) {
    val regex = """^command:([^?]+)(?:\?(.+))?$""".toRegex()
    val matchResult = regex.find(command) ?: return
    val (commandName, encodedArguments) = matchResult.destructured
    val arguments =
        encodedArguments
            .takeIf { it.isNotEmpty() }
            ?.let { encoded ->
              val decoded = URLDecoder.decode(encoded, "UTF-8")
              try {
                Gson().fromJson(decoded, JsonArray::class.java).toList()
              } catch (e: Exception) {
                null
              }
            } ?: emptyList()
    if (_options.enableCommandUris == true ||
        (_options.enableCommandUris as List<*>).contains(commandName)) {
      CodyAgentService.withAgent(project) {
        it.server.commandExecute(CommandExecuteParams(commandName, arguments))
      }
    }
  }

  override fun dispose() {
    // TODO: Consider cleaning up the view.
    CodyAgentService.withAgent(project) {
      it.server.webviewDidDisposeNative(WebviewDidDisposeParams(handle))
    }
  }
}

class WebUIProxy(private val host: WebUIHost, private val browser: JBCefBrowserBase) {
  companion object {

    /**
     * TODO: Hopefully this can be removed when JetBrains will patch focus handler implementation
     *   https://youtrack.jetbrains.com/issue/IJPL-158952/Focus-issue-when-using-multiple-JCEF-instances
     *   Focus switching is caused by something higher in the call stack, so best we can do here is
     *   to break the chain of focus stealing
     */
    private fun patchBrowserFocusHandler(browser: JBCefBrowserBase) {
      val myFocusHandlerField = browser.jbCefClient.javaClass.getDeclaredField("myFocusHandler")
      myFocusHandlerField.isAccessible = true
      val myFocusHandler = myFocusHandlerField.get(browser.jbCefClient)
      val clearMethod = myFocusHandler.javaClass.getDeclaredMethod("clear")
      clearMethod.isAccessible = true
      clearMethod.invoke(myFocusHandler)

      browser.jbCefClient.addFocusHandler(
          object : CefFocusHandlerAdapter() {
            val previouslyFocused = mutableListOf<Pair<Component, Long>>()

            // Circuit breaker to prevent focus flickering between different WebViews
            fun isFocusAllowed(component: Component): Boolean {
              val currentTime = System.currentTimeMillis()
              val recentFocus = previouslyFocused.lastOrNull { it.first == component }
              if (recentFocus != null && currentTime - recentFocus.second < 50) {
                return false
              }

              previouslyFocused.add(Pair(component, currentTime))
              if (previouslyFocused.size > 10) { // Keep only the last 10 entries
                previouslyFocused.removeFirst()
              }

              return true
            }

            override fun onSetFocus(
                browser: CefBrowser,
                source: CefFocusHandler.FocusSource
            ): Boolean {
              return !browser.uiComponent.hasFocus() &&
                  isFocusAllowed(browser.uiComponent) &&
                  browser.uiComponent.requestFocusInWindow()
            }
          },
          browser.cefBrowser)
    }

    fun create(host: WebUIHost): WebUIProxy {
      val browser =
          JBCefBrowserBuilder()
              .apply {
                setOffScreenRendering(CodyApplicationSettings.instance.isOffScreenRenderingEnabled)
                // TODO: Make this conditional on running in a debug configuration.
                setEnableOpenDevToolsMenuItem(true)
              }
              .build()

      patchBrowserFocusHandler(browser)
      val proxy = WebUIProxy(host, browser)

      val viewToHost =
          JBCefJSQuery.create(browser as JBCefBrowserBase).apply {
            addHandler { query: String ->
              proxy.handleCefQuery(query)
              JBCefJSQuery.Response(null)
            }
          }
      val apiScript =
          """
      globalThis.acquireVsCodeApi = (function() {
          let acquired = false;
          let state = ${host.stateAsJSONString};

          return () => {
              if (acquired && !false) {
                  throw new Error('An instance of the VS Code API has already been acquired');
              }
              acquired = true;
              return Object.freeze({
                  postMessage: function(message, transfer) {
                    console.assert(!transfer);
                    ${viewToHost.inject("JSON.stringify({what: 'postMessage', value: message})")}
                  },
                  setState: function(newState) {
                    ${viewToHost.inject("JSON.stringify({what: 'setState', value: newState})")}
                    state = newState;
                    return newState;
                  },
                  getState: function() {
                    return state;
                  }
              });
          };
      })();
      delete window.parent;
      delete window.top;
      delete window.frameElement;

      document.addEventListener('DOMContentLoaded', () => {
        ${viewToHost.inject("JSON.stringify({what:'DOMContentLoaded'})")}
      });
    """
              .trimIndent()
      browser.jbCefClient.addRequestHandler(
          ExtensionRequestHandler(proxy, apiScript), browser.cefBrowser)
      browser.jbCefClient.addLifeSpanHandler(
          object : CefLifeSpanHandler {
            override fun onBeforePopup(
                browser: CefBrowser,
                frame: CefFrame?,
                targetUrl: String,
                targetFrameName: String?
            ): Boolean {
              if (browser.mainFrame !== frame) {
                BrowserOpener.openInBrowser(null, targetUrl)
                return true
              }
              return false
            }

            override fun onAfterCreated(browser: CefBrowser?) {}

            override fun onAfterParentChanged(browser: CefBrowser?) {}

            override fun doClose(browser: CefBrowser?): Boolean {
              return true
            }

            override fun onBeforeClose(browser: CefBrowser?) {}
          },
          browser.cefBrowser)
      return proxy
    }
  }

  private fun handleCefQuery(query: String) {
    val queryObject = JsonParser.parseString(query).asJsonObject
    val queryWhat = queryObject["what"]?.asString

    when (queryWhat) {
      "postMessage" -> {
        val queryValue = queryObject["value"] ?: return
        host.postMessageWebviewToHost(queryValue.toString())

        val messageObject = if (queryValue.isJsonObject) queryValue.asJsonObject else return
        if (messageObject["command"]?.asString == "copy" &&
            messageObject["text"]?.asString != null) {
          val textToCopy = messageObject["text"].asString
          CopyPasteManager.getInstance().setContents(StringSelection(textToCopy))
        }
      }
      "setState" -> {
        val queryValue = queryObject["value"] ?: return
        host.stateAsJSONString = queryValue.toString()
      }
      "DOMContentLoaded" -> onDOMContentLoaded()
      else -> {
        logger.warn("unhandled query from Webview to host: $query")
      }
    }
  }

  private var isDOMContentLoaded = false
  private val logger = Logger.getInstance(WebUIProxy::class.java)
  private var theme: WebTheme? = null

  private var _title: String = ""
  var title: String
    get() = _title
    set(value) {
      host.setTitle(value)
      _title = value
    }

  private var _html: String = ""
  var html: String
    get() = _html
    set(value) {
      _html = value
      browser.loadURL("$MAIN_RESOURCE_URL?${value.hashCode()}")
    }

  fun setOptions(value: WebviewOptions) {
    host.setOptions(value)
  }

  val component: JComponent?
    get() = browser.component

  fun onCommand(command: String) {
    host.onCommand(command)
  }

  fun postMessageHostToWebview(stringEncodedJsonMessage: String) {
    val code =
        """
      (() => {
        let e = new CustomEvent('message');
        e.data = ${stringEncodedJsonMessage};
        window.dispatchEvent(e);
      })()
      """
            .trimIndent()

    browser.cefBrowser.mainFrame?.executeJavaScript(code, "cody://postMessage", 0)
  }

  private fun onDOMContentLoaded() {
    isDOMContentLoaded = true
    theme?.let { updateTheme(it) }
  }

  fun updateTheme(theme: WebTheme) {
    this.theme = theme
    if (!this.isDOMContentLoaded) {
      logger.info("not updating WebView theme before DOMContentLoaded")
      return
    }
    val code =
        """
    (() => {
      let e = new CustomEvent('message');
      e.data = {
        type: 'ui/theme',
        agentIDE: 'JetBrains',
        cssVariables: ${gson.toJson(theme.variables)},
        isDark: ${theme.isDark}
      };
      window.dispatchEvent(e);
    })()
    """
            .trimIndent()

    browser.cefBrowser.mainFrame?.executeJavaScript(code, "cody://updateTheme", 0)
  }

  fun dispose() {
    browser.dispose()
    host.dispose()
  }
}

class ExtensionRequestHandler(private val proxy: WebUIProxy, private val apiScript: String) :
    CefRequestHandler {
  override fun onBeforeBrowse(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest,
      userGesture: Boolean,
      isRedirect: Boolean
  ): Boolean {
    if (request.url.startsWith(COMMAND_PREFIX)) {
      proxy.onCommand(request.url)
      return true
    }
    if (request.url.startsWith(MAIN_RESOURCE_URL)) {
      return false
    }
    BrowserOpener.openInBrowser(null, request.url)
    return true
  }

  override fun onOpenURLFromTab(
      browser: CefBrowser?,
      frame: CefFrame?,
      targetUrl: String?,
      userGesture: Boolean
  ): Boolean {
    // TODO: Add Telemetry
    // We don't support tabbed browsing so cancel navigation.
    return true
  }

  override fun getResourceRequestHandler(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest,
      isNavigation: Boolean,
      isDownload: Boolean,
      requestInitiator: String?,
      disableDefaultHandling: BoolRef?
  ): CefResourceRequestHandler? {
    // JBCef-style loadHTML URLs dump the desired resource URL into a hash in a file:// URL :shrug:
    if (request.url.startsWith(PSEUDO_HOST_URL_PREFIX)) {
      disableDefaultHandling?.set(true)
      return ExtensionResourceRequestHandler(proxy, apiScript)
    }
    disableDefaultHandling?.set(false)
    return null
  }

  override fun getAuthCredentials(
      browser: CefBrowser?,
      originUrl: String?,
      isProxy: Boolean,
      host: String?,
      port: Int,
      realm: String?,
      scheme: String?,
      callback: CefAuthCallback?
  ): Boolean {
    // We do not load web content that requires authentication.
    return false
  }

  override fun onCertificateError(
      browser: CefBrowser?,
      cert_error: CefLoadHandler.ErrorCode?,
      request_url: String?,
      sslInfo: CefSSLInfo?,
      callback: CefCallback?
  ): Boolean {
    // TODO: Add Telemetry here.
    return false
  }

  override fun onRenderProcessTerminated(
      browser: CefBrowser?,
      status: CefRequestHandler.TerminationStatus?
  ) {
    // TODO: Add Telemetry here.
    // TODO: Logging.
    // TODO: Trigger a reload.
  }
}

class ExtensionResourceRequestHandler(
    private val proxy: WebUIProxy,
    private val apiScript: String
) : CefResourceRequestHandler {
  override fun getCookieAccessFilter(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest?
  ): CefCookieAccessFilter {
    // TODO: Make this a single object.
    return object : CefCookieAccessFilter {
      override fun canSaveCookie(
          browser: CefBrowser?,
          frame: CefFrame?,
          request: CefRequest?,
          response: CefResponse?,
          cookie: CefCookie?
      ): Boolean {
        // We do not load web content that uses cookies, so block them all.
        return false
      }

      override fun canSendCookie(
          browser: CefBrowser?,
          frame: CefFrame?,
          request: CefRequest?,
          cookie: CefCookie?
      ): Boolean {
        // We do not load web content that uses cookies, so there are no cookies to send.
        return false
      }
    }
  }

  override fun onBeforeResourceLoad(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest?
  ): Boolean {
    return false
  }

  override fun getResourceHandler(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest
  ): CefResourceHandler {
    return when {
      request.url.startsWith(MAIN_RESOURCE_URL) ->
          MainResourceHandler(proxy.html.replace("<head>", "<head><script>$apiScript</script>"))
      else -> ExtensionResourceHandler()
    }
  }

  override fun onResourceRedirect(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest?,
      response: CefResponse?,
      newUrl: StringRef?
  ) {
    // We do not serve redirects.
    TODO("unreachable")
  }

  override fun onResourceResponse(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest?,
      response: CefResponse?
  ): Boolean {
    return false
  }

  override fun onResourceLoadComplete(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest?,
      response: CefResponse?,
      status: CefURLRequest.Status?,
      receivedContentLength: Long
  ) {
    // No-op
  }

  override fun onProtocolExecution(
      browser: CefBrowser?,
      frame: CefFrame?,
      request: CefRequest?,
      allowOsExecution: BoolRef?
  ) {
    TODO("Not yet implemented")
  }
}

class ExtensionResourceHandler() : CefResourceHandler {
  private val logger = Logger.getInstance(ExtensionResourceHandler::class.java)
  var status = 0
  var bytesReadFromResource = 0L
  private var bytesSent = 0L
  private var bytesWaitingSend = ByteBuffer.allocate(512 * 1024).flip()

  // correctly
  private var contentLength = 0L
  var contentType = "text/plain"
  var readChannel: AsynchronousFileChannel? = null

  override fun processRequest(request: CefRequest, callback: CefCallback?): Boolean {
    val requestPath = URI(request.url).path.removePrefix("/")

    ApplicationManager.getApplication().executeOnPooledThread {
      // Find the plugin resources.
      val codyDirOverride = System.getenv("CODY_DIR")
      val resourcesPath =
          if (codyDirOverride != null) {
            Path(codyDirOverride).resolve("agent/dist")
          } else {
            CodyAgent.pluginDirectory()?.resolve("agent")
          }
      if (resourcesPath == null) {
        logger.warn(
            "Aborting WebView request for ${requestPath}, extension resource directory not found")
        status = 500
        callback?.Continue()
        return@executeOnPooledThread
      }

      // Find the specific file being requested.
      val filePath = resourcesPath.resolve(requestPath)
      if (!resourcesPath.isAncestor(filePath)) {
        logger.warn("Aborting WebView request for ${requestPath}, attempted directory traversal?")
        status = 400
        callback?.Continue()
        return@executeOnPooledThread
      }

      // Find the particulars of that file.
      val file = filePath.toFile()
      contentLength = file.length()
      contentType =
          when {
            requestPath.endsWith(".css") -> "text/css"
            requestPath.endsWith(".html") -> "text/html"
            requestPath.endsWith(".js") -> "text/javascript"
            requestPath.endsWith(".png") -> "image/png"
            requestPath.endsWith(".svg") -> "image/svg+xml"
            requestPath.endsWith(".ttf") -> "font/ttf"
            else -> "text/plain"
          }

      // Prepare to read the file contents.
      try {
        readChannel = AsynchronousFileChannel.open(file.toPath(), StandardOpenOption.READ)
      } catch (e: IOException) {
        logger.warn(
            "Failed to open file ${file.absolutePath} to serve extension WebView request $requestPath",
            e)
        status = 404
        callback?.Continue()
        return@executeOnPooledThread
      }

      // We're ready to synthesize headers.
      status = 200
      callback?.Continue()
    }
    return true
  }

  override fun getResponseHeaders(
      response: CefResponse?,
      responseLength: IntRef?,
      redirectUrl: StringRef?
  ) {
    response?.status = status
    response?.mimeType = contentType
    // TODO: Security, if we host malicious third-party content would this let them retrieve
    // resources they should not?
    response?.setHeaderByName("access-control-allow-origin", "*", false)
    // TODO: Do we need to set content-encoding here?
    responseLength?.set(contentLength.toInt())
  }

  override fun readResponse(
      dataOut: ByteArray?,
      bytesToRead: Int,
      bytesRead: IntRef?,
      callback: CefCallback?
  ): Boolean {
    if (bytesSent >= contentLength || dataOut == null) {
      try {
        readChannel?.close()
      } catch (_: IOException) {}
      bytesRead?.set(0)
      return false
    }

    if (bytesWaitingSend.remaining() > 0) {
      val willSendNumBytes = min(bytesWaitingSend.remaining(), bytesToRead)
      bytesWaitingSend.get(dataOut, 0, willSendNumBytes)
      bytesRead?.set(willSendNumBytes)
      return true
    } else {
      bytesWaitingSend.flip()
      bytesWaitingSend.limit(bytesWaitingSend.capacity())
    }

    if (readChannel == null) {
      // We need to read more, but the readChannel is closed.
      bytesRead?.set(0)
      return false
    }

    // Start an asynchronous read.
    readChannel?.read(
        bytesWaitingSend,
        bytesReadFromResource,
        null,
        object : CompletionHandler<Int, Void?> {
          override fun completed(result: Int, attachment: Void?) {
            if (result == -1) {
              try {
                readChannel?.close()
              } catch (_: IOException) {}
              readChannel = null
            } else {
              bytesReadFromResource += result
            }
            bytesWaitingSend.flip()
            callback?.Continue()
          }

          override fun failed(exc: Throwable?, attachment: Void?) {
            try {
              readChannel?.close()
            } catch (_: IOException) {}
            readChannel = null
            callback?.Continue()
          }
        })

    bytesRead?.set(0)
    return true
  }

  override fun cancel() {
    try {
      readChannel?.close()
    } catch (_: IOException) {}
    readChannel = null
  }
}

class MainResourceHandler(content: String) : CefResourceHandler {
  // Copying this all in memory is awful, but Java is awful.
  private val buffer = StandardCharsets.UTF_8.encode(content)

  override fun processRequest(request: CefRequest?, callback: CefCallback?): Boolean {
    callback?.Continue()
    return true
  }

  override fun getResponseHeaders(
      response: CefResponse,
      responseLength: IntRef,
      redirectUrl: StringRef
  ) {
    response.status = 200
    response.mimeType = "text/html"
    responseLength.set(buffer.remaining())
  }

  override fun readResponse(
      dataOut: ByteArray,
      bytesToRead: Int,
      bytesRead: IntRef?,
      callback: CefCallback?
  ): Boolean {
    if (!buffer.hasRemaining()) {
      return false
    }
    val bytesAvailable = buffer.remaining()
    val bytesToCopy = minOf(bytesAvailable, bytesToRead)
    buffer.get(dataOut, 0, bytesToCopy)
    bytesRead?.set(bytesToCopy)
    return true
  }

  override fun cancel() {}
}
