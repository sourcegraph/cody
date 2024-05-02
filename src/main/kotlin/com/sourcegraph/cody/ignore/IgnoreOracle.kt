package com.sourcegraph.cody.ignore

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.util.containers.SLRUMap
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.IgnoreTestParams
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
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
  private val fileListeners: MutableList<FocusedFileIgnorePolicyListener> = mutableListOf()

  init {
    // Synthesize a focus event for the current editor, if any, to fetch and cache ignore state for
    // it.
    runInEdt {
      val editor = FileEditorManager.getInstance(project).selectedTextEditor
      if (willFocusUri == null && editor != null) {
        val uri = ProtocolTextDocument.fromEditor(editor)?.uri
        if (uri != null) {
          focusedFileDidChange(uri)
        }
      }
    }
  }

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

        // Update the status bar.
        CodyStatusService.resetApplication(project)

        val listeners = synchronized(fileListeners) { fileListeners.toList() }
        for (listener in listeners) {
          listener.focusedFileIgnorePolicyChanged(policy)
        }
      }
    }
  }

  fun addListener(listener: FocusedFileIgnorePolicyListener) {
    synchronized(fileListeners) { fileListeners.add(listener) }
    // Invoke the listener with the focused file policy to set initial state.
    listener.focusedFileIgnorePolicyChanged(focusedPolicy ?: IgnorePolicy.USE)
  }

  fun removeListener(listener: FocusedFileIgnorePolicyListener) {
    synchronized(fileListeners) { fileListeners.remove(listener) }
  }

  /**
   * Notifies the IgnoreOracle that the ignore policy has changed. Called by CodyAgentService's
   * client callbacks.
   */
  fun onIgnoreDidChange() {
    synchronized(cache) { cache.clear() }

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
      policyForUri(uri, agent).thenAccept(completable::complete)
    }
    return completable
  }

  /** Like `policyForUri(String)` but reuses the current thread and supplied Agent handle. */
  fun policyForUri(uri: String, agent: CodyAgent): CompletableFuture<IgnorePolicy> {
    return agent.server.ignoreTest(IgnoreTestParams(uri)).thenApply {
      val policy =
          when (it.policy) {
            "ignore" -> IgnorePolicy.IGNORE
            "use" -> IgnorePolicy.USE
            else -> throw IllegalStateException("invalid ignore policy value")
          }
      synchronized(cache) { cache.put(uri, policy) }
      policy
    }
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

  interface FocusedFileIgnorePolicyListener {
    fun focusedFileIgnorePolicyChanged(policy: IgnorePolicy)
  }
}
