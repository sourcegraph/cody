package com.sourcegraph.cody.ignore

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.containers.SLRUMap
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.IgnoreTestParams
import com.sourcegraph.cody.statusbar.CodyStatusService
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

enum class IgnorePolicy(val value: String) {
  IGNORE("ignore"),
  USE("use"),
}

/**
 * Provides details about whether files and repositories must be ignored as chat context, for
 * autocomplete, etc. per policy.
 */
@Service(Service.Level.PROJECT)
class IgnoreOracle(private val project: Project) {
  companion object {
    fun getInstance(project: Project): IgnoreOracle {
      return project.service<IgnoreOracle>()
    }
  }

  private val cache = SLRUMap<String, IgnorePolicy>(100, 100)
  @Volatile private var focusedPolicy: IgnorePolicy? = null
  @Volatile private var willFocusUri: String? = null

  val isEditingIgnoredFile: Boolean
    get() {
      return focusedPolicy == IgnorePolicy.IGNORE
    }

  fun focusedFileDidChange(uri: String) {
    willFocusUri = uri
    ApplicationManager.getApplication().executeOnPooledThread {
      val policy = policyForUri(uri).get()
      if (focusedPolicy != policy && willFocusUri == uri) {
        focusedPolicy = policy
        CodyStatusService.resetApplication(project)
      }
    }
  }

  /**
   * Notifies the IgnoreOracle that the ignore policy has changed. Called by CodyAgentService's
   * client callbacks.
   */
  fun onIgnoreDidChange() {
    synchronized(cache) { cache.clear() }

    IgnoreNotificationProvider.updateNotifications(project)

    // Re-set the focused file URI to update the status bar.
    val uri = willFocusUri
    if (uri != null) {
      focusedFileDidChange(uri)
    }
  }

  /** Gets whether `uri` should be ignored for autocomplete, context, etc. */
  fun policyForUri(uri: String): CompletableFuture<IgnorePolicy> {
    val completable = CompletableFuture<IgnorePolicy>()
    val result = synchronized(cache) { cache[uri] }
    if (result != null) {
      completable.complete(result)
      return completable
    }
    CodyAgentService.withAgent(project) { agent ->
      val policy =
          when (agent.server.ignoreTest(IgnoreTestParams(uri)).get().policy) {
            "ignore" -> IgnorePolicy.IGNORE
            "use" -> IgnorePolicy.USE
            else -> throw IllegalStateException("invalid ignore policy value")
          }
      synchronized(cache) { cache.put(uri, policy) }
      completable.complete(policy)
    }
    return completable
  }

  /**
   * Gets whether `uri` should be ignored for autocomplete, etc. If the result is not available
   * quickly, returns null and invokes `orElse` on a pooled thread when the result is available.
   */
  fun policyForUriOrElse(uri: String, orElse: (policy: IgnorePolicy) -> Unit): IgnorePolicy? {
    val completable = policyForUri(uri)
    try {
      return completable.get(16, TimeUnit.MILLISECONDS)
    } catch (timedOut: TimeoutException) {
      ApplicationManager.getApplication().executeOnPooledThread { orElse(completable.get()) }
      return null
    }
  }
}
