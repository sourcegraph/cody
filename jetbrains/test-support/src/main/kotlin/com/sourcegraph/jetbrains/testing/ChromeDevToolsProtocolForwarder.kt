package com.sourcegraph.jetbrains.testing

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.components.Service
import com.intellij.ui.jcef.JBCefBrowser
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.http.HttpStatusCode
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.yield
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.cef.browser.CefDevToolsClient
import java.lang.ref.WeakReference

data class WebviewData(val cdpUrl: String, val viewType: String, val state: String)

class WebviewTarget {
    companion object {
        var nextId = 0
    }

    val id = synchronized(WebviewTarget) {
        WebviewTarget.nextId++
    }
    val viewType: String
    val client: WeakReference<CefDevToolsClient>

    constructor(viewType: String, devtoolsClient: CefDevToolsClient) {
        this.viewType = viewType
        this.client = WeakReference(devtoolsClient)
    }
}

@Service(Service.Level.APP)
class ChromeDevToolsProtocolForwarder {
    val targets = mutableListOf<WebviewTarget>()

    fun version(devToolsUrlPrefix: String): String {
        // TODO: This hard-codes the first target.
        return "{\"Protocol-Version\":\"1.3\",\"webSocketDebuggerUrl\":\"${devToolsUrlPrefix}0\"}"
    }

    // TODO: Rationalize this with /json/list/ in the CDP protocol
    fun listWebviews(devToolsUrlPrefix: String): List<WebviewData> {
        return synchronized(this.targets) {
            this.targets.map {
                WebviewData("${devToolsUrlPrefix}${it.id}", it.viewType, if (it.client.get() == null) { "dead" } else { "alive" })
            }
        }
    }

    suspend fun handleSession(webviewId: Int, session: DefaultWebSocketServerSession) {
        val target = synchronized(this.targets) {
            this.targets.find { it.id == webviewId }
        }
        if (target == null) {
            session.call.response.status(HttpStatusCode.NotFound)
            return
        }
        val client = target.client.get()
        if (client == null) {
            session.call.response.status(HttpStatusCode.Gone)
            return
        }
        for (message in session.incoming) {
            message as? Frame.Text ?: continue
            val payload = message.readText()
            println("ws: ${payload}")
            val gson = Gson()
            val json = gson.fromJson(payload, JsonObject::class.java)
            val params = json.get("params")
            val future = client.executeDevToolsMethod(json.get("method").asString, if (params != null)  { gson.toJson(params) } else { null })
            try {
                // TODO: Don't block here.
                val value = gson.fromJson(future.get(), JsonObject::class.java)
                println("DevTools result: $value")
                val result = JsonObject()
                result.addProperty("id", json.get("id").asNumber)
                result.add("result", value)
                session.send(Frame.Text(gson.toJson(result)))
            } catch (e: Exception) {
                println("DevTools error: ${e.message}")
            }
            // TODO: Forward the result.
        }
        // TODO: Check if we have other, concurrent sessions.
        // TODO: Receive messages and forward them.
        // TODO: Receive events and forward them to the session.
    }
    fun didCreateBrowser(viewType: String, browser: JBCefBrowser) {
        val weakBrowser = WeakReference(browser)
        val targets = this.targets
        CoroutineScope(Dispatchers.Default).launch {
            val devToolsClient = startDevTools(weakBrowser) ?: return@launch
            synchronized (targets) {
                targets.add(WebviewTarget(viewType, devToolsClient))
            }
        }
    }

    suspend fun startDevTools(weakBrowser: WeakReference<JBCefBrowser>): CefDevToolsClient? {
        var devToolsClient: CefDevToolsClient? = null
        while (true) {
            val browser = weakBrowser.get() ?: break
            devToolsClient = browser.cefBrowser.devToolsClient
            // Subtlety:
            // devToolsClient can be null (underlying browser is not created; we must wait)
            // isClosed can be true (browser created but devtools not started)
            // isClosed can be false (we're ready to go)
            if (devToolsClient?.isClosed == false) {
                break
            }
            yield()
        }
        if (devToolsClient == null) {
            // TODO: Replace this with logging
            println("IDE did create browser but collected before devtools client available")
        }
        return devToolsClient
    }
/*
    var openedDevtools = false

    // Example flow for connecting to DevTools:
// - Wait for cefBrowser.devToolsClient to be non-null
// - Wait for isClosed to be false
// - Send a command, for example "Browser.getVersion", "{}" and inspect the result
// - Add a listener and log events. Note, send e.g. Log.enable to enable the events for the domain.
    fun checkDevTools(browser: JBCefBrowser) {
        val devtoolsClient = browser.cefBrowser.devToolsClient
        println("*** devtools client? $devtoolsClient")
        if (devtoolsClient != null) {
            if (devtoolsClient.isClosed && !openedDevtools) {
                println("*** opening devtools")
                // browser.openDevtools()
                openedDevtools = true
                invokeLater {
                    checkDevTools(browser)
                }
            } else if (devtoolsClient.isClosed && openedDevtools) {
                // wait
                invokeLater {
                    checkDevTools(browser)
                }
            } else {
                devtoolsClient.addEventListener { eventName, messageAsJson ->
                    println("*** devtools client event, $eventName : $messageAsJson")
                }
                devtoolsClient.executeDevToolsMethod(
                    "Browser.getVersion",
                    "{}"
                ).thenApply {
                    println("*** executed command $it")
                }
                devtoolsClient.executeDevToolsMethod(
                    "Log.enable",
                    "{}"
                ).thenApply {
                    println("*** enabled logging $it")
                }
            }
        } else {
            invokeLater {
                checkDevTools(browser)
            }
        }
    }

 */
}
