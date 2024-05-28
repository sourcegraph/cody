package com.sourcegraph.cody.context

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetRepoIdsParam
import com.sourcegraph.cody.agent.protocol.Repo
import com.sourcegraph.cody.context.ui.RemoteRepoResolutionFailedNotification
import com.sourcegraph.vcs.CodebaseName
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

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

  /**
   * Resolves the repositories named in `repos` and runs `callback` with the result. If remote repo
   * resolution fails, displays an error message instead.
   */
  fun resolveReposWithErrorNotification(
      project: Project,
      repos: List<CodebaseName>,
      callback: (List<Repo>) -> Unit
  ): CompletableFuture<Unit> {
    if (repos.isEmpty()) {
      val completion = CompletableFuture<Unit>()
      ApplicationManager.getApplication().executeOnPooledThread {
        callback(emptyList())
        completion.complete(Unit)
      }
      return completion
    }
    return getRepositories(project, repos)
        .completeOnTimeout(emptyList(), 15, TimeUnit.SECONDS)
        .thenApply { resolvedRepos ->
          if (resolvedRepos.isEmpty() && repos.isNotEmpty()) {
            runInEdt { RemoteRepoResolutionFailedNotification().notify(project) }
            return@thenApply
          }
          callback(resolvedRepos)
        }
  }
}
