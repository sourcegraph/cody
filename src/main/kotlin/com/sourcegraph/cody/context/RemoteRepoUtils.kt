package com.sourcegraph.cody.context

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetRepoIdsParam
import com.sourcegraph.cody.agent.protocol.Repo
import com.sourcegraph.vcs.CodebaseName
import java.util.concurrent.CompletableFuture

object RemoteRepoUtils {
  /**
   * Gets any repository IDs which match `codebaseNames`. If `codebaseNames` is empty, completes
   * with an empty list.
   */
  fun getRepositories(
      project: Project,
      codebaseNames: List<CodebaseName>
  ): CompletableFuture<List<Repo>> {
    val result = CompletableFuture<List<Repo>>()
    if (codebaseNames.isEmpty()) {
      result.complete(emptyList())
      return result
    }
    CodyAgentService.withAgent(project) { agent ->
      try {
        val param = GetRepoIdsParam(codebaseNames.map { it.value }, codebaseNames.size)
        val repos = agent.server.getRepoIds(param).get()
        result.complete(repos?.repos ?: emptyList())
      } catch (e: Exception) {
        result.complete(emptyList())
      }
    }
    return result
  }
}
