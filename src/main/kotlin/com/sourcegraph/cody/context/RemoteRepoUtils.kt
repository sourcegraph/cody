package com.sourcegraph.cody.context

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetRepoIdsParam
import com.sourcegraph.cody.agent.protocol.Repo
import java.util.concurrent.CompletableFuture

object RemoteRepoUtils {
  fun getRepository(project: Project, url: String): CompletableFuture<Repo?> {
    val result = CompletableFuture<List<Repo>>()
    CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
      try {
        agent.server.getRepoIds(GetRepoIdsParam(listOf(url), 1)).thenApply {
          result.complete(it?.repos)
        }
      } catch (e: Exception) {
        result.complete(null)
      }
    }
    return result.thenApply { it?.firstOrNull() }
  }
}
