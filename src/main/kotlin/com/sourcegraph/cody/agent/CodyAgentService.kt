package com.sourcegraph.cody.agent

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.chat.AgentChatSessionService
import com.sourcegraph.cody.statusbar.CodyAutocompleteStatusService
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.function.Consumer

@Service(Service.Level.PROJECT)
class CodyAgentService(project: Project) : Disposable {

  private val logger = Logger.getInstance(CodyAgent::class.java)
  private var codyAgent: CompletableFuture<CodyAgent> = CompletableFuture()

  private val startupActions: MutableList<(CodyAgent) -> Unit> = mutableListOf()

  init {
    onStartup { agent ->
      agent.client.onNewMessage = Consumer { params ->
        if (!project.isDisposed) {
          AgentChatSessionService.getInstance(project)
              .getSession(params.id)
              ?.receiveMessage(params.message)
        }
      }

      agent.client.onReceivedWebviewMessage = Consumer { params ->
        if (!project.isDisposed) {
          AgentChatSessionService.getInstance(project)
              .getSession(params.id)
              ?.receiveWebviewExtensionMessage(params.message)
        }
      }
    }
  }

  fun onStartup(action: (CodyAgent) -> Unit) {
    synchronized(startupActions) { startupActions.add(action) }
  }

  private fun getInitializedAgent(project: Project): CompletableFuture<CodyAgent> {
    synchronized(this) {
      return if (codyAgent.isDone) {
        if (codyAgent.get().isConnected()) codyAgent else restartAgent(project)
      } else {
        codyAgent
      }
    }
  }

  fun startAgent(project: Project): CompletableFuture<CodyAgent> {
    synchronized(this) {
      ApplicationManager.getApplication().executeOnPooledThread {
        var agent: CodyAgent? = null
        while (agent == null || !agent.isConnected()) {
          try {
            agent = CodyAgent.create(project).get(15, TimeUnit.SECONDS)
          } catch (e: Exception) {
            logger.warn("Failed to start Cody agent, retrying...", e)
          }
        }
        synchronized(startupActions) { startupActions.forEach { action -> action(agent) } }
        codyAgent.complete(agent)
        CodyAutocompleteStatusService.resetApplication(project)
      }

      return codyAgent
    }
  }

  fun stopAgent(project: Project?): CompletableFuture<Void?> {
    synchronized(this) {
      codyAgent.cancel(true)

      val res =
          codyAgent.thenCompose {
            project?.let { CodyAutocompleteStatusService.resetApplication(it) }
            it.shutdown()
          }

      codyAgent = CompletableFuture()

      return res
    }
  }

  fun restartAgent(project: Project): CompletableFuture<CodyAgent> {
    synchronized(this) {
      stopAgent(project)
      return startAgent(project)
    }
  }

  override fun dispose() {
    stopAgent(null)
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): CodyAgentService {
      return project.service<CodyAgentService>()
    }

    @JvmStatic
    fun applyAgentOnBackgroundThread(project: Project, block: Consumer<CodyAgent>) {
      getInstance(project).getInitializedAgent(project).thenAccept { agent ->
        ApplicationManager.getApplication().executeOnPooledThread { block.accept(agent) }
      }
    }

    @JvmStatic
    fun withAgentOnUIThread(project: Project, block: Consumer<CodyAgent>) {
      getInstance(project).getInitializedAgent(project).thenAccept { agent ->
        ApplicationManager.getApplication().invokeLater { block.accept(agent) }
      }
    }

    @JvmStatic
    fun getAgent(project: Project): CompletableFuture<CodyAgent> {
      return getInstance(project).getInitializedAgent(project)
    }

    @JvmStatic
    fun isConnected(project: Project): Boolean {
      return getAgent(project).getNow(null)?.isConnected() == true
    }
  }
}
