package com.sourcegraph.cody.context

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentException
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.RemoteRepoHasParams
import com.sourcegraph.cody.agent.protocol.RemoteRepoListParams
import com.sourcegraph.cody.agent.protocol.Repo
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

@Service(Service.Level.PROJECT)
class RemoteRepoSearcher(private val project: Project) {
  companion object {
    fun getInstance(project: Project): RemoteRepoSearcher {
      return project.service<RemoteRepoSearcher>()
    }
  }

  private val logger = Logger.getInstance(RemoteRepoSearcher::class.java)

  fun cancellableHas(repoName: String): Boolean {
    val result = has(repoName)
    while (true) {
      ProgressManager.checkCanceled()
      try {
        return result.get(10, TimeUnit.MILLISECONDS)
      } catch (e: TimeoutException) {
        // ignore
      }
    }
  }

  /** Gets whether `repoName` is a known remote repo. */
  fun has(repoName: String): CompletableFuture<Boolean> {
    val result = CompletableFuture<Boolean>()
    CodyAgentService.withAgent(project) { agent ->
      agent.server.remoteRepoHas(RemoteRepoHasParams(repoName)).thenApply {
        result.complete(it.result)
      }
    }
    return result
  }

  fun cancellableSearch(query: String?): List<String> {
    val result = search(query)
    while (true) {
      ProgressManager.checkCanceled()
      try {
        return result.get(10, TimeUnit.MILLISECONDS)
      } catch (e: TimeoutException) {
        // ignore
      }
    }
  }

  fun search(query: String?): CompletableFuture<List<String>> {
    val result = CompletableFuture<List<String>>()
    val repos = mutableListOf<Repo>()
    CodyAgentService.withAgent(project) { agent ->
      do {
        val stepDone = CompletableFuture<Boolean>()
        agent.server
            .remoteRepoList(
                RemoteRepoListParams(
                    query = query,
                    first = 500,
                    after = repos.lastOrNull()?.id,
                ))
            .thenApply { partialResult ->
              if (partialResult.state.error != null) {
                logger.warn(
                    "remote repository search had error: ${partialResult.state.error.title}")
                if (partialResult.repos.isEmpty() && repos.isEmpty()) {
                  result.completeExceptionally(CodyAgentException(partialResult.state.error.title))
                  stepDone.complete(false)
                  return@thenApply
                }
              }
              logger.debug(
                  "remote repo search $query adding ${partialResult.repos.size} results (${partialResult.state.state})")
              repos.addAll(partialResult.repos)
              if (partialResult.state.state != "fetching") {
                result.complete(repos.map { it.name })
                stepDone.complete(false)
                return@thenApply
              }
              stepDone.complete(true)
            }
      } while (stepDone.get())
    }
    return result
  }
}
