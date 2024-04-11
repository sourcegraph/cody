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
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.cody.statusbar.CodyStatusService
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicReference
import java.util.function.Consumer

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

      agent.client.onEditTaskDidUpdate = Consumer { task ->
        FixupService.getInstance(project).getSessionForTask(task)?.update(task)
      }

      agent.client.onEditTaskDidDelete = Consumer { task ->
        FixupService.getInstance(project).getSessionForTask(task)?.taskDeleted()
      }

      agent.client.onWorkspaceEdit = Consumer { params ->
        // TODO: We should change the protocol and send `taskId` as part of `WorkspaceEditParam`
        // and then use method like `getSessionForTask` instead of this one
        FixupService.getInstance(project).getActiveSession()?.performWorkspaceEdit(params)
      }

      agent.client.onTextDocumentEdit = Consumer { params ->
        FixupService.getInstance(project).getActiveSession()?.performInlineEdits(params.edits)
      }

      if (!project.isDisposed) {
        AgentChatSessionService.getInstance(project).restoreAllSessions(agent)
        val fileEditorManager = FileEditorManager.getInstance(project)
        fileEditorManager.openFiles.forEach { file ->
          CodyFileEditorListener.fileOpened(fileEditorManager, agent, file)
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
        val agent = CodyAgent.create(project).get(45, TimeUnit.SECONDS)
        if (!agent.isConnected()) {
          val msg = "Failed to connect to agent Cody agent"
          logger.error(msg)
          codyAgent.completeExceptionally(CodyAgentException(msg))
        } else {
          synchronized(startupActions) { startupActions.forEach { action -> action(agent) } }
          codyAgent.complete(agent)
          CodyStatusService.resetApplication(project)
        }
      } catch (e: TimeoutException) {
        val msg = "Failed to start Cody agent in timely manner, please run any Cody action to retry"
        logger.warn(msg, e)
        setAgentError(project, msg)
        codyAgent.completeExceptionally(CodyAgentException(msg, e))
      } catch (e: Exception) {
        val msg = "Failed to start Cody agent"
        logger.error(msg, e)
        setAgentError(project, msg)
        codyAgent.completeExceptionally(CodyAgentException(msg, e))
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
    fun setAgentError(project: Project, e: Exception) {
      setAgentError(project, ((e.cause as? CodyAgentException) ?: e).message ?: e.toString())
    }

    @JvmStatic
    fun setAgentError(project: Project, errorMsg: String?) {
      val oldErrorMsg = agentError.getAndSet(errorMsg)
      if (oldErrorMsg != errorMsg) project.let { CodyStatusService.resetApplication(it) }
    }

    @JvmStatic
    private fun withAgent(
        project: Project,
        restartIfNeeded: Boolean,
        callback: Consumer<CodyAgent>,
        onFailure: Consumer<Exception> = Consumer {}
    ) {
      if (CodyApplicationSettings.instance.isCodyEnabled) {
        ApplicationManager.getApplication().executeOnPooledThread {
          try {
            val instance = getInstance(project)
            val isReadyButNotFunctional = instance.codyAgent.getNow(null)?.isConnected() == false
            val agent =
                if (isReadyButNotFunctional && restartIfNeeded) instance.restartAgent(project)
                else instance.codyAgent

            callback.accept(agent.get())
            setAgentError(project, null)
          } catch (e: Exception) {
            logger.warn("Failed to execute call to agent", e)
            onFailure.accept(e)
            if (restartIfNeeded) getInstance(project).restartAgent(project)
          }
        }
      }
    }

    @JvmStatic
    fun withAgent(
        project: Project,
        callback: Consumer<CodyAgent>,
    ) = withAgent(project, restartIfNeeded = false, callback = callback)

    @JvmStatic
    fun withAgentRestartIfNeeded(
        project: Project,
        callback: Consumer<CodyAgent>,
    ) = withAgent(project, restartIfNeeded = true, callback = callback)

    @JvmStatic
    fun withAgentRestartIfNeeded(
        project: Project,
        callback: Consumer<CodyAgent>,
        onFailure: Consumer<Exception>
    ) = withAgent(project, restartIfNeeded = true, callback = callback, onFailure = onFailure)

    @JvmStatic
    fun isConnected(project: Project): Boolean {
      return try {
        getInstance(project).codyAgent.getNow(null)?.isConnected() == true
      } catch (e: Exception) {
        false
      }
    }
  }
}
