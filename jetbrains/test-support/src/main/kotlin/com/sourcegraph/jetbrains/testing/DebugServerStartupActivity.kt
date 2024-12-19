package com.sourcegraph.jetbrains.testing

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DebugServerStartupActivity : ProjectActivity {
  override suspend fun execute(project: Project) {
    withContext(Dispatchers.IO) {
      val server = embeddedServer(Netty, port = 8083) {
        routing {
          get("/healthz") {
            call.respondText("OK")
          }
        }
      }
      server.start(wait = false)
    }
  }
}
