package com.sourcegraph.jetbrains.testing

import com.google.gson.Gson
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.intellij.openapi.components.Service
import com.intellij.ui.jcef.JBCefBrowser
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.http.HttpStatusCode
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
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
        return "{\"Protocol-Version\":\"1.3\",\"webSocketDebuggerUrl\":\"ws${devToolsUrlPrefix}devtools/browser/0\"}"
    }

    // TODO: Rationalize this with /json/list/ in the CDP protocol
    fun listWebviews(devToolsUrlPrefix: String): List<WebviewData> {
        return synchronized(this.targets) {
            this.targets.map {
                WebviewData("${devToolsUrlPrefix}devtools/browser/${it.id}", it.viewType, if (it.client.get() == null) { "dead" } else { "alive" })
            }
        }
    }

    suspend fun handleSession(webviewId: Int, session: DefaultWebSocketServerSession) {
        val gson = Gson()
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
        val eventChannel = Channel<String>()
        client.addEventListener { eventName, messageAsJson ->
            val params = gson.fromJson(messageAsJson, JsonObject::class.java)
            val message = JsonObject().apply {
                addProperty("method", eventName)
                add("params", params)
            }
            eventChannel.trySend(gson.toJson(message))
        }
        val eventsJob = CoroutineScope(Dispatchers.IO).launch {
            for (message in eventChannel) {
                // TODO: Is it OK to call this from IO?
                session.send(Frame.Text(message))
            }
        }
        for (message in session.incoming) {
            message as? Frame.Text ?: continue
            val payload = message.readText()
            println("> $payload")
            val json = gson.fromJson(payload, JsonObject::class.java)
            val id = json.get("id").asNumber
            val sessionId = json.get("sessionId")
            val method = json.get("method").asString
            val params = json.get("params")

            // We hijack some CDP methods that JCEF doesn't support.
            if (method == "Browser.setDownloadBehavior") {
                session.send(Frame.Text("{\"id\":$id,\"result\":{}}"))
                continue
            }

            // TODO: Should this be EDT?
            // TODO: executeDevToolsMethod says it accepts null here, but null and "null" fail for Browser.getVersion.
            val future = client.executeDevToolsMethod(method, gson.toJson(params ?: JsonObject()))
            val result = JsonObject()
            val extras = mutableListOf<JsonObject>()
            try {
                // TODO: Don't block here.
                val value = gson.fromJson(future.get(), JsonObject::class.java)
                result.add("result", value)

                // With the intrinsic protocol, after Target.setAutoAttach we get:
                // method: Target.attachedToTarget
                // params:
                //   sessionId: GUID string
                //   targetInfo:
                //     targetId: GUID string
                //     type: "page"
                //     title: "Cody"
                //     url: "https://file+.sourcegraphstatic.com/main-resource-nonce?<number>
                //     attached: true
                //     canAccessOpener: false
                //     browserContextId: GUID string
                //   waitingForDebugger: false
                // To have enough information for this, we need to catch the Target.getTargetInfo response:
                if (method == "Target.getTargetInfo") {
                    // Playwright-CDP hacks: attach to the target
                    extras.add(JsonObject().apply {
                        addProperty("method", "Target.attachedToTarget")
                        add("params", JsonObject().apply {
                            // TODO: Make up a legit session ID.
                            addProperty("sessionId", "woozlwuzl")
                            add("targetInfo", value.getAsJsonObject("targetInfo"))
                            addProperty("waitingForDebugger", false)
                        })
                    })
                }
            } catch (e: Exception) {
                println("devtools failed: ${e.message}")
                result.addProperty("error", e.toString())
            }
            result.addProperty("id", id)
            if (sessionId != null) {
                result.add("sessionId", sessionId)
            }
            val resultText = gson.toJson(result)
            println("< $resultText")
            session.send(Frame.Text(resultText))

            for (extra in extras) {
                val extraText = gson.toJson(extra)
                println("<(extra) $extraText")
                session.send(Frame.Text(extraText))
            }
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
