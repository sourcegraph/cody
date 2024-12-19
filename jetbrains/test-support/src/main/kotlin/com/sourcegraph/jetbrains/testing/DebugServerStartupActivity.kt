package com.sourcegraph.jetbrains.testing

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

class DebugServerStartupActivity : ProjectActivity {
  override suspend fun execute(project: Project) {
    withContext(Dispatchers.IO) {
      val server = embeddedServer(Netty, port = 8083) {
        install(ContentNegotiation) {
          json(Json {
            prettyPrint = true
          })
        }
        install(WebSockets)
        routing {
          get("/statusz") {
            call.respondText("OK")
          }
          get("/webviews") {
            call.respond(service<ChromeDevToolsProtocolForwarder>().listWebviews("http://localhost:8083/cdp/"))
          }
          webSocket("/cdp/{webviewId}") {
            val webviewId = call.parameters["webviewId"]?.toIntOrNull()
            if (webviewId == null) {
              call.respond(HttpStatusCode.NotFound)
                return@webSocket
            }
            service<ChromeDevToolsProtocolForwarder>().handleSession(webviewId, this)
          }
        }
      }
      server.start(wait = false)
    }
  }
}
