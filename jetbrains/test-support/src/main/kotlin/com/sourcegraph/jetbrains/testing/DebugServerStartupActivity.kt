package com.sourcegraph.jetbrains.testing

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.withCharset
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.request.uri
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.websocket.*
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.Frame
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DebugServerStartupActivity : ProjectActivity {
  override suspend fun execute(project: Project) {
    withContext(Dispatchers.IO) {
      val devToolsUrlPrefix = "://localhost:8083/cdp/"
      val server = embeddedServer(Netty, port = 8083) {
        install(WebSockets)
        routing {
          get("/statusz") {
            call.respondText("OK")
          }
          get("/webviews") {
              val webviews = service<ChromeDevToolsProtocolForwarder>().listWebviews(devToolsUrlPrefix)
              // TODO: Replace this with ktor content negotiation and serialization
              // when the core plugin build lets us use the Kotlin serialization plugin
              val gson = com.google.gson.Gson()
              val json = gson.toJson(webviews)
              call.respondText(json, ContentType.Application.Json.withCharset(Charsets.UTF_8))
          }
            get("/json/version/") {
                call.respondText(service<ChromeDevToolsProtocolForwarder>().version(devToolsUrlPrefix), ContentType.Application.Json.withCharset(Charsets.UTF_8))
            }
          webSocket("/cdp/{webviewId}") {
            val webviewId = call.parameters["webviewId"]?.toIntOrNull()
            if (webviewId == null) {
              call.respond(HttpStatusCode.NotFound)
                return@webSocket
            }
            service<ChromeDevToolsProtocolForwarder>().handleSession(webviewId, this)
          }
        get {
            println("got request for ${call.request.uri}")
            call.respond(HttpStatusCode.NotFound, call.request.uri)
          }
        }
      }
      server.start(wait = false)
    }
  }
}
