package com.sourcegraph.cody.agent

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.util.net.HttpConfigurable
import com.sourcegraph.cody.chat.AgentChatSessionService
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.context.RemoteRepoSearcher
import com.sourcegraph.cody.edit.FixupService
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.listeners.CodyFileEditorListener
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.utils.CodyEditorUtil
import java.util.Timer
import java.util.TimerTask
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicReference
import java.util.function.Consumer
import java.util.function.Function
import kotlinx.coroutines.runBlocking

@Service(Service.Level.PROJECT)
class CodyAgentService(private val project: Project) : Disposable {

  @Volatile private var codyAgent: CompletableFuture<CodyAgent> = CompletableFuture()

  private val startupActions: MutableList<(CodyAgent) -> Unit> = mutableListOf()

  private var previousProxyHost: String? = null
  private var previousProxyPort: Int? = null
  private val timer = Timer()

  init {
    // Initialize with current proxy settings
    val proxy = HttpConfigurable.getInstance()
    previousProxyHost = proxy.PROXY_HOST
    previousProxyPort = proxy.PROXY_PORT
    // Schedule the task to check for proxy changes
    timer.schedule(
        object : TimerTask() {
          override fun run() {
            checkForProxyChanges()
          }
        },
        0,
        5000) // Check every 5 seconds
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
        FixupService.getInstance(project).getActiveSession()?.update(task)
      }

      agent.client.onEditTaskDidDelete = Consumer { params ->
        FixupService.getInstance(project).getActiveSession()?.let {
          if (params.id == it.taskId) it.dismiss()
        }
      }

      agent.client.onWorkspaceEdit = Function { params ->
        try {
          FixupService.getInstance(project).getActiveSession()?.performWorkspaceEdit(params)
          true
        } catch (e: RuntimeException) {
          logger.error(e)
          false
        }
      }

      agent.client.onTextDocumentEdit = Function { params ->
        try {
          FixupService.getInstance(project).getActiveSession()?.performInlineEdits(params.edits)
          true
        } catch (e: RuntimeException) {
          logger.error(e)
          false
        }
      }

      agent.client.onTextDocumentShow = Function { params ->
        val selection = params.options?.selection?.toVSCodeRange()
        val preserveFocus = params.options?.preserveFocus
        val vf = CodyEditorUtil.findFileOrScratch(project, params.uri) ?: return@Function false
        CodyEditorUtil.showDocument(project, vf, selection, preserveFocus)
        true
      }

      agent.client.onOpenUntitledDocument = Function { params ->
        // We always get a file which does not start with file:// there.
        // They start with untitled:// which is VSCode-specific way
        // to say that files does not exist on the disk yet.
        val vf =
            CodyEditorUtil.createFileOrScratch(project, params.uri, params.content)
                ?: return@Function false
        ApplicationManager.getApplication().invokeAndWait {
          CodyEditorUtil.showDocument(project, vf)
        }
        true
      }

      agent.client.onRemoteRepoDidChange = Consumer {
        RemoteRepoSearcher.getInstance(project).remoteRepoDidChange()
      }

      agent.client.onRemoteRepoDidChangeState = Consumer { state ->
        RemoteRepoSearcher.getInstance(project).remoteRepoDidChangeState(state)
      }

      agent.client.onIgnoreDidChange = Consumer {
        IgnoreOracle.getInstance(project).onIgnoreDidChange()
      }

      if (!project.isDisposed) {
        AgentChatSessionService.getInstance(project).restoreAllSessions(agent)
        CodyFileEditorListener.registerAllOpenedFiles(project, agent)
      }
    }
  }

  private fun checkForProxyChanges() {
    val proxy = HttpConfigurable.getInstance()
    val currentProxyHost = proxy.PROXY_HOST
    val currentProxyPort = proxy.PROXY_PORT

    if (currentProxyHost != previousProxyHost || currentProxyPort != previousProxyPort) {
      // Proxy settings have changed
      previousProxyHost = currentProxyHost
      previousProxyPort = currentProxyPort
      reloadAgent()
    }
  }

  private fun reloadAgent() {
    restartAgent(project)
  }

  private fun onStartup(action: (CodyAgent) -> Unit) {
    synchronized(startupActions) { startupActions.add(action) }
  }

  fun startAgent(project: Project): CompletableFuture<CodyAgent> {
    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        val future =
            CodyAgent.create(project).exceptionally { err ->
              val msg = "Creating agent unsuccessful: ${err.localizedMessage}"
              logger.error(msg)
              throw (CodyAgentException(msg))
            }
        val agent = future.get(45, TimeUnit.SECONDS)
        if (!agent.isConnected()) {
          val msg = "Failed to connect to agent Cody agent"
          logger.error(msg)
          throw CodyAgentException(msg) // This will be caught by the catch blocks below
        } else {
          synchronized(startupActions) { startupActions.forEach { action -> action(agent) } }
          codyAgent.complete(agent)
          CodyStatusService.resetApplication(project)
        }
      } catch (e: Exception) {
        val msg =
            if (e is TimeoutException)
                "Failed to start Cody agent in timely manner, please run any Cody action to retry"
            else "Failed to start Cody agent"
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
    timer.cancel()
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
          runBlocking {
            val task: suspend (CodyAgent) -> Unit = { agent ->
              try {
                callback.accept(agent)
              } catch (e: Exception) {
                onFailure.accept(e)
              }
            }
            coWithAgent(project, restartIfNeeded, task)
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

    suspend fun <T> coWithAgent(project: Project, callback: suspend (CodyAgent) -> T) =
        coWithAgent(project, false, callback)

    suspend fun <T> coWithAgent(
        project: Project,
        restartIfNeeded: Boolean,
        callback: suspend (CodyAgent) -> T
    ): T {
      if (!CodyApplicationSettings.instance.isCodyEnabled) {
        throw Exception("Cody is not enabled")
      }
      try {
        val instance = CodyAgentService.getInstance(project)
        val isReadyButNotFunctional = instance.codyAgent.getNow(null)?.isConnected() == false
        val agent =
            if (isReadyButNotFunctional && restartIfNeeded) instance.restartAgent(project)
            else instance.codyAgent
        val result = callback(agent.get())
        setAgentError(project, null)
        return result
      } catch (e: Exception) {
        logger.warn("Failed to execute call to agent", e)
        if (restartIfNeeded && e !is ProcessCanceledException) {
          getInstance(project).restartAgent(project)
        }
        throw e
      }
    }
  }
}
