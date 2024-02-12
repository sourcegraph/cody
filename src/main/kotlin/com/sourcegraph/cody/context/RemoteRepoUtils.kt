package com.sourcegraph.cody.context

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetRepoIdsParam
import com.sourcegraph.cody.agent.protocol.Repo
import java.util.concurrent.CompletableFuture

object RemoteRepoUtils {
  fun getRepository(project: Project, codebaseName: String): CompletableFuture<Repo?> {
    return CodyAgentService.withAgent(project).thenCompose { agent ->
      try {
        agent.server.getRepoIds(GetRepoIdsParam(listOf(codebaseName), 1)).thenApply {
          it?.repos?.firstOrNull()
        }
      } catch (e: Exception) {
        null
      }
    }
  }
}
