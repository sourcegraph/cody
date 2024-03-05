package com.sourcegraph.cody.agent

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyFileEditorListener
import com.sourcegraph.cody.chat.AgentChatSessionService
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.statusbar.CodyStatusService
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.function.Consumer
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException

@Service(Service.Level.PROJECT)
class CodyAgentService(project: Project) : Disposable {

  @Volatile private var codyAgent: CompletableFuture<CodyAgent> = CompletableFuture()

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

      if (!project.isDisposed) {
        FileEditorManager.getInstance(project).openFiles.forEach { file ->
          CodyFileEditorListener.fileOpened(project, agent, file)
        }
      }
    }
  }

  private fun onStartup(action: (CodyAgent) -> Unit) {
    synchronized(startupActions) { startupActions.add(action) }
  }

  fun startAgent(project: Project): CompletableFuture<CodyAgent> {
    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        val agent = CodyAgent.create(project).get(25, TimeUnit.SECONDS)
        if (!agent.isConnected()) {
          val msg = "Failed to connect to agent Cody agent"
          logger.error(msg)
          codyAgent.completeExceptionally(Exception(msg))
        } else {
          synchronized(startupActions) { startupActions.forEach { action -> action(agent) } }
          codyAgent.complete(agent)
          CodyStatusService.resetApplication(project)
        }
      } catch (e: Exception) {
        val msg = "Failed to start Cody agent"
        logger.error(msg, e)
        codyAgent.completeExceptionally(Exception(msg, e))
      }
    }

    return codyAgent
  }

  fun stopAgent(project: Project?) {
    try {
      codyAgent.getNow(null)?.shutdown()
    } catch (e: Exception) {
      logger.warn("Failed to stop Cody agent gracefully", e)
    } finally {
      codyAgent = CompletableFuture()
      project?.let { CodyStatusService.resetApplication(it) }
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
    private val logger = Logger.getInstance(CodyAgent::class.java)

    val agentError: AtomicReference<String?> = AtomicReference(null)

    @JvmStatic
    fun getInstance(project: Project): CodyAgentService {
      return project.service<CodyAgentService>()
    }

    @JvmStatic
    fun setAgentError(project: Project, errorMsg: String?) {
      agentError.set(errorMsg)
      project.let { CodyStatusService.resetApplication(it) }
    }

    @JvmStatic
    private fun withAgent(
        project: Project,
        restartIfNeeded: Boolean,
        callback: Consumer<CodyAgent>
    ) {
      if (CodyApplicationSettings.instance.isCodyEnabled) {
        setAgentError(project, null)
        ApplicationManager.getApplication().executeOnPooledThread {
          val instance = getInstance(project)
          val isReadyButNotFunctional = instance.codyAgent.getNow(null)?.isConnected() == false
          val agent =
              if (isReadyButNotFunctional && restartIfNeeded) instance.restartAgent(project)
              else instance.codyAgent
          try {
            callback.accept(agent.get())
          } catch (e: Exception) {
            logger.warn("Failed to execute call to agent", e)
            val responseErrorException = e.cause as? ResponseErrorException
            if (responseErrorException != null) {
              setAgentError(
                  project, responseErrorException.message ?: responseErrorException.toString())
            }
            if (restartIfNeeded) {
              instance.restartAgent(project)
              withAgent(project, restartIfNeeded = false, callback)
            }
          }
        }
      }
    }

    @JvmStatic
    fun withAgent(project: Project, callback: Consumer<CodyAgent>) =
        withAgent(project, restartIfNeeded = false, callback = callback)

    @JvmStatic
    fun withAgentRestartIfNeeded(project: Project, callback: Consumer<CodyAgent>) =
        withAgent(project, restartIfNeeded = true, callback = callback)

    @JvmStatic
    fun isConnected(project: Project): Boolean {
      return getInstance(project).codyAgent.getNow(null)?.isConnected() == true
    }
  }
}
