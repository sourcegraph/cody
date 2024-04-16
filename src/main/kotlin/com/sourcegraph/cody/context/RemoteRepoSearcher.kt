package com.sourcegraph.cody.context

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentException
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.RemoteRepoFetchState
import com.sourcegraph.cody.agent.protocol.RemoteRepoHasParams
import com.sourcegraph.cody.agent.protocol.RemoteRepoListParams
import com.sourcegraph.cody.agent.protocol.RemoteRepoListResponse
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first

@Service(Service.Level.PROJECT)
class RemoteRepoSearcher(private val project: Project) {
  companion object {
    fun getInstance(project: Project): RemoteRepoSearcher {
      return project.service<RemoteRepoSearcher>()
    }
  }

  private val logger = Logger.getInstance(RemoteRepoSearcher::class.java)

  private val _state = MutableStateFlow(RemoteRepoFetchState("paused", null))
  val state: StateFlow<RemoteRepoFetchState> = _state

  /**
   * Gets whether `repoName` is a known remote repo. This may block while repo loading is in
   * progress.
   */
  suspend fun has(repoName: String): Boolean {
    return CodyAgentService.coWithAgent(project) { agent ->
      val completable = agent.server.remoteRepoHas(RemoteRepoHasParams(repoName))
      var completed: Boolean
      while (true) {
        try {
          completed = completable.get(100, TimeUnit.MILLISECONDS).result
          break
        } catch (e: TimeoutException) {
          // ignore
        }
        currentCoroutineContext().ensureActive()
      }
      completed
    }
  }

  suspend fun search(query: String?): ReceiveChannel<List<String>> {
    val result = Channel<List<String>>(2)
    CodyAgentService.coWithAgent(project) { agent ->
      val runQuery: suspend () -> Boolean = {
        val completableRepos =
            agent.server.remoteRepoList(
                RemoteRepoListParams(
                    query = query,
                    first = 500,
                    after = null,
                ))
        var repos: RemoteRepoListResponse
        while (true) {
          // Check for cancellation every 100ms.
          currentCoroutineContext().ensureActive()
          try {
            repos = completableRepos.get(100, TimeUnit.MILLISECONDS)
            break
          } catch (e: TimeoutException) {
            // ignore
          }
        }
        if (repos == null) {
          true // unreachable
        } else {
          if (repos.state.error != null) {
            logger.warn("remote repository search had error: ${repos.state.error?.title}")
            if (repos.repos.isEmpty()) {
              result.close(CodyAgentException(repos.state.error?.title))
            }
          }
          _state.value = repos.state
          logger.debug(
              "remote repo search $query returning ${repos.repos.size} results (${repos.state.state})")
          result.send(repos.repos.map { it.name })
          !fetchDone(repos.state)
        }
      }

      try {
        // Run the query until we're satisfied there's no more results.
        while (runQuery()) {
          // Wait for the fetch to finish.
          state.first {
            currentCoroutineContext().ensureActive()
            fetchDone(it)
          }
        }
        result.close()
      } catch (e: Exception) {
        result.close(e)
      }
    }
    return result
  }

  private fun fetchDone(state: RemoteRepoFetchState): Boolean {
    return state.state == "complete" || state.state == "errored"
  }

  // Callbacks for CodyAgentService
  fun remoteRepoDidChange() {
    // Ignore this. `search` uses the earliest available result.
  }

  fun remoteRepoDidChangeState(state: RemoteRepoFetchState) {
    _state.value = state
  }
}
