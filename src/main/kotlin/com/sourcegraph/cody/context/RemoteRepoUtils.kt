package com.sourcegraph.cody.context

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetRepoIdsParam
import com.sourcegraph.cody.agent.protocol.Repo
import com.sourcegraph.vcs.CodebaseName
import java.util.concurrent.CompletableFuture

object RemoteRepoUtils {
  fun getRepository(project: Project, codebaseName: CodebaseName): CompletableFuture<Repo?> {
    val result = CompletableFuture<Repo?>()
    CodyAgentService.withAgent(project) { agent ->
      try {
        val repos = agent.server.getRepoIds(GetRepoIdsParam(listOf(codebaseName.value), 1)).get()
        result.complete(repos?.repos?.firstOrNull())
      } catch (e: Exception) {
        result.complete(null)
      }
    }
    return result
  }
}
