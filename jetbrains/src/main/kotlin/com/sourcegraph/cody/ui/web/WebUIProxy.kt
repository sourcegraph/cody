package com.sourcegraph.cody.ui.web

import com.google.gson.GsonBuilder
import com.google.gson.JsonParser
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.ProjectManager
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefBrowserBuilder
import com.intellij.ui.jcef.JBCefJSQuery
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.WebviewOptions
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.sidebar.WebTheme
import com.sourcegraph.cody.telemetry.TelemetryV2
import com.sourcegraph.common.BrowserOpener
import java.awt.Component
import java.awt.datatransfer.StringSelection
import java.io.IOException
import java.net.URI
import java.nio.ByteBuffer
import java.nio.channels.AsynchronousFileChannel
import java.nio.channels.CompletionHandler
import java.nio.charset.StandardCharsets
import java.nio.file.StandardOpenOption
import javax.swing.JComponent
import kotlin.math.min
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefAuthCallback
import org.cef.callback.CefBeforeDownloadCallback
import org.cef.callback.CefCallback
import org.cef.callback.CefDownloadItem
import org.cef.callback.CefDownloadItemCallback
import org.cef.handler.CefCookieAccessFilter
import org.cef.handler.CefDownloadHandler
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

private const val COMMAND_PREFIX = "command:"

// We make up a host name and serve the static resources into the webview apparently from this host.
private const val PSEUDO_HOST_URL_PREFIX = "https://file+.sourcegraphstatic.com/"
private const val MAIN_RESOURCE_URL = "${PSEUDO_HOST_URL_PREFIX}main-resource-nonce"

internal class WebUIProxy(private val host: WebUIHost, private val browser: JBCefBrowserBase) {
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
    """
              .trimIndent()

      browser.jbCefClient.addDownloadHandler(
          object : CefDownloadHandler {
            override fun onBeforeDownload(
                browser: CefBrowser?,
                downloadItem: CefDownloadItem?,
                suggestedName: String?,
                callback: CefBeforeDownloadCallback?
            ) {
              callback?.Continue(/* downloadPath = */ "", /* showDialog = */ true)
            }

            override fun onDownloadUpdated(
                browser: CefBrowser?,
                downloadItem: CefDownloadItem?,
                callback: CefDownloadItemCallback?
            ) {}
          },
          browser.cefBrowser)

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

  fun openDevTools() {
    browser.openDevtools()
  }

  private fun handleCefQuery(query: String) {
    val queryObject = JsonParser.parseString(query).asJsonObject
    val queryWhat = queryObject["what"]?.asString

    when (queryWhat) {
      "postMessage" -> {
        // These are hooks which observe and respond to messages from webview to host.
        // See sourcegraph/cody vscode/src/chat/protocol.ts for details.
        val queryValue = queryObject["value"] ?: return
        host.postMessageWebviewToHost(queryValue.toString())

        val messageObject = if (queryValue.isJsonObject) queryValue.asJsonObject else return
        if (messageObject["command"]?.asString == "copy" &&
            messageObject["text"]?.asString != null) {
          val textToCopy = messageObject["text"].asString
          CopyPasteManager.getInstance().setContents(StringSelection(textToCopy))
        } else if (messageObject["command"]?.asString == "ready") {
          onReady()
        }
      }
      "setState" -> {
        val queryValue = queryObject["value"] ?: return
        host.stateAsJSONString = queryValue.toString()
      }
      else -> {
        logger.warn("unhandled query from Webview to host: $query")
      }
    }
  }

  private var isReady = false
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

    browser.cefBrowser.executeJavaScript(code, "cody://postMessage", 0)
  }

  private fun onReady() {
    isReady = true
    theme?.let { updateTheme(it) }
  }

  fun updateTheme(theme: WebTheme) {
    val gson = GsonBuilder().create()
    this.theme = theme
    if (!this.isReady) {
      logger.info("not updating WebView theme before 'ready' event")
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

    browser.cefBrowser.executeJavaScript(code, "cody://updateTheme", 0)
  }

  fun dispose() {
    browser.dispose()
    host.dispose()
  }
}

private class ExtensionRequestHandler(
    private val proxy: WebUIProxy,
    private val apiScript: String
) : CefRequestHandler {
  private val logger = Logger.getInstance(ExtensionRequestHandler::class.java)

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
    proxy.openDevTools()
    logger.warn(
        """Certificate error occurred while loading URL: $request_url
        Error code: ${cert_error?.name}
        SSL Info: $sslInfo"""
            .trimIndent())
    ProjectManager.getInstance().openProjects.forEach { project ->
      TelemetryV2.sendTelemetryEvent(project, "cody.webview.request", "certError")
    }
    return false
  }

  override fun onRenderProcessTerminated(
      browser: CefBrowser?,
      status: CefRequestHandler.TerminationStatus?
  ) {
    logger.warn("Browser render process terminated: ${status?.name}")
    ProjectManager.getInstance().openProjects.forEach { project ->
      TelemetryV2.sendTelemetryEvent(project, "cody.webview.request", "renderProcessTerminated")
      CodyAgentService.getInstance(project).restartAgent(project)
    }
  }
}

private class ExtensionResourceRequestHandler(
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

class ExtensionResourceHandler : CefResourceHandler {
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
      val resourcesPath = CodyAgent.pluginDirectory()?.resolve("agent")
      if (resourcesPath == null) {
        logger.warn(
            "Aborting WebView request for ${requestPath}, extension resource directory not found")
        status = 500
        callback?.Continue()
        return@executeOnPooledThread
      }

      // Find the specific file being requested.
      val filePath = resourcesPath.resolve(requestPath)
      if (!filePath.startsWith(resourcesPath)) {
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

/// Handles webview features a WebUIProxy can't implement with a JBCEF browser and agent alone.
interface WebviewViewDelegate {
  fun setTitle(newTitle: String)
  // TODO: Implement icons.
}
