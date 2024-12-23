package com.sourcegraph.jetbrains.testing

import com.google.gson.JsonObject
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.request.uri
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.contentType
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield

/**
 * Wire snitch for the Chrome DevTools protocol, with some rewriting so WebSockets and
 * HTTP traffic transit the snitch. Forwards from 8084 to 9226.
 */
class ChromeDevToolsSnitch : ProjectActivity {
    override suspend fun execute(project: Project) {
        withContext(Dispatchers.IO) {
            val devToolsPort = 8084
            // TODO: replace 8081, the mitmproxy port, with devToolsPort
            val devToolsUrlOrigin = "localhost:8081"
            val upstreamUrlOrigin = "localhost:9226"
            val server = embeddedServer(Netty, port = devToolsPort) {
                install(WebSockets)
                routing {
                    webSocket("/devtools/browser/{browserId}") {
                        println("got websocket request for ${call.request.uri}")
                        val downstreamToUpstream = Channel<Frame>()
                        val upstreamToDownstream = Channel<Frame>()
                        launch(Dispatchers.Default) {
                            try {
                                io.ktor.client.HttpClient() {
                                    install(io.ktor.client.plugins.websocket.WebSockets)
                                }.webSocket("ws://${upstreamUrlOrigin}${call.request.uri}") {
                                    launch(Dispatchers.Default) {
                                        for (frame in downstreamToUpstream) {
                                            send(frame)
                                        }
                                    }
                                    for (frame in incoming) {
                                        val text = (frame as? Frame.Text)?.readText()
                                        println("< $text")
                                        upstreamToDownstream.send(frame)
                                    }
                                }
                            } catch (e: Exception) {
                                println("upstream websocket request failed: ${e.message}")
                            }
                        }
                        launch {
                            for (frame in upstreamToDownstream) {
                                send(frame)
                            }
                        }
                        for (frame in incoming) {
                            val text = (frame as? Frame.Text)?.readText();
                            println("> $text")

                            try {
                                // Hacks: JCEF Browser.setDownloadBehavior says "Browser context management is not supported."
                                // But we don't need to test downloads, so just let it ride.
                                val json = com.google.gson.Gson().fromJson(text, JsonObject::class.java)
                                if (json.get("method").asString == "Browser.setDownloadBehavior") {
                                    val id = json.get("id").asNumber
                                    send(Frame.Text("{\"id\":$id,\"result\":{}}"))
                                    continue
                                }
                            } catch (e: Exception) {
                                println("failed to parse request: ${e.message} text=$text")
                            }

                            downstreamToUpstream.send(frame)
                        }
                    }
                    get(Regex(".*")) {
                        println("got request for ${call.request.uri}")
                        try {
                            val response =
                                io.ktor.client.HttpClient().get("http://${upstreamUrlOrigin}${call.request.uri}")
                            var body = response.bodyAsText()
                            body = body.replace(upstreamUrlOrigin, devToolsUrlOrigin)
                            call.respondText(body, response.contentType(), response.status)
                        } catch (cause: Throwable) {
                            println("failed to service ${call.request.uri}: ${cause.message}")
                        }
                    }
                }
            }
            server.start(wait = false)
        }
    }
}
