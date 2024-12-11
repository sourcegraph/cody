package com.sourcegraph.cody.agent

import com.intellij.notification.NotificationsManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.util.net.HttpConfigurable
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.listeners.CodyFileEditorListener
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.cody.ui.web.WebUIService
import com.sourcegraph.common.CodyBundle
import java.util.Timer
import java.util.TimerTask
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicReference
import java.util.function.Consumer

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
      if (!project.isDisposed) {
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

  fun startAgent(project: Project, secondsTimeout: Long = 45): CompletableFuture<CodyAgent> {
    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        val future =
            CodyAgent.create(project).exceptionally { err ->
              val msg = "Creating agent unsuccessful: ${err.localizedMessage}"
              logger.error(msg)
              throw (CodyAgentException(msg))
            }

        val agent = future.get(secondsTimeout, TimeUnit.SECONDS)
        if (!agent.isConnected()) {
          val msg = "Failed to connect to agent Cody agent"
          logger.error(msg)
          throw CodyAgentException(msg) // This will be caught by the catch blocks below
        } else {
          synchronized(startupActions) { startupActions.forEach { action -> action(agent) } }
          codyAgent.complete(agent)
          CodyStatusService.resetApplication(project)
        }
      } catch (e: TimeoutException) {
        val msg = CodyBundle.getString("error.cody-connection-timeout.message")
        runInEdt {
          val isNoBalloonDisplayed =
              NotificationsManager.getNotificationsManager()
                  .getNotificationsOfType(
                      CodyConnectionTimeoutExceptionNotification::class.java, project)
                  .all { it.balloon == null }
          if (isNoBalloonDisplayed) {
            CodyConnectionTimeoutExceptionNotification().notify(project)
          }
        }
        setAgentError(project, msg)
        codyAgent.completeExceptionally(CodyAgentException(msg, e))
      } catch (e: Exception) {
        val msg = CodyBundle.getString("error.cody-starting.message")
        setAgentError(project, msg)
        logger.error(msg, e)
        codyAgent.completeExceptionally(CodyAgentException(msg, e))
      }
    }
    return codyAgent
  }

  fun stopAgent(project: Project?): CompletableFuture<Void>? {
    try {
      val shutdownFuture = codyAgent.getNow(null)?.shutdown()
      return (shutdownFuture ?: CompletableFuture.completedFuture(null)).thenCompose {
        project?.let { WebUIService.getInstance(it).reset() }
      }
    } catch (e: Exception) {
      logger.warn("Failed to stop Cody agent gracefully", e)
      return CompletableFuture.failedFuture(e)
    } finally {
      codyAgent = CompletableFuture()
      project?.let { CodyStatusService.resetApplication(it) }
    }
  }

  fun restartAgent(project: Project, secondsTimeout: Long = 90): CompletableFuture<CodyAgent> {
    synchronized(this) {
      stopAgent(project)
      return startAgent(project, secondsTimeout)
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
    fun setAgentError(project: Project, errorMsg: String?) {
      val oldErrorMsg = agentError.getAndSet(errorMsg)
      if (oldErrorMsg != errorMsg) project.let { CodyStatusService.resetApplication(it) }
    }

    @JvmStatic
    private fun withAgent(
        project: Project,
        restartIfNeeded: Boolean,
        callback: Consumer<CodyAgent>
    ) {
      if (CodyApplicationSettings.instance.isCodyEnabled) {
        ApplicationManager.getApplication().executeOnPooledThread {
          try {
            if (project.isDisposed) return@executeOnPooledThread
            val instance = getInstance(project)
            val isReadyButNotFunctional = instance.codyAgent.getNow(null)?.isConnected() == false
            val agent =
                if (isReadyButNotFunctional && restartIfNeeded) instance.restartAgent(project)
                else instance.codyAgent
            callback.accept(agent.get())
            setAgentError(project, null)
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

    @JvmStatic
    fun withAgent(project: Project, callback: Consumer<CodyAgent>) =
        withAgent(project, restartIfNeeded = false, callback = callback)

    @JvmStatic
    fun withAgentRestartIfNeeded(project: Project, callback: Consumer<CodyAgent>) =
        withAgent(project, restartIfNeeded = true, callback = callback)

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
