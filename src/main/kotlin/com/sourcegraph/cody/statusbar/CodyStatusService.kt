package com.sourcegraph.cody.statusbar

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.config.CodyAccountManager
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil
import javax.annotation.concurrent.GuardedBy

@Service
class CodyStatusService : CodyStatusListener, Disposable {

  @GuardedBy("this") private var status: CodyStatus = CodyStatus.CodyUninit

  init {
    ApplicationManager.getApplication()
        .messageBus
        .connect(this)
        .subscribe(CodyStatusListener.TOPIC, this)
  }

  override fun onCodyAutocompleteStatus(codyStatus: CodyStatus) {
    val notify =
        synchronized(this) {
          val oldStatus = status
          status = codyStatus
          return@synchronized oldStatus != codyStatus
        }
    if (notify) {
      updateCodyStatusBarIcons()
    }
  }

  override fun onCodyAutocompleteStatusReset(project: Project) {
    ApplicationManager.getApplication().executeOnPooledThread {
      if (!project.isDisposed) {
        val notify = didStatusChange(project)
        if (notify) {
          updateCodyStatusBarIcons()
        }
      }
    }
  }

  private fun didStatusChange(project: Project): Boolean {
    synchronized(this) {
      val oldStatus = status
      val service = ApplicationManager.getApplication().getService(CodyAccountManager::class.java)
      val token =
          CodyAuthenticationManager.getInstance(project)
              .getActiveAccount()
              ?.let(service::findCredentials)
      status =
          if (!ConfigUtil.isCodyEnabled()) {
            CodyStatus.CodyDisabled
          } else if (!ConfigUtil.isCodyAutocompleteEnabled()) {
            CodyStatus.AutocompleteDisabled
          } else if (CodyAgentService.agentError.get() != null) {
            CodyStatus.AgentError
          } else if (!CodyAgentService.isConnected(project)) {
            CodyStatus.CodyAgentNotRunning
          } else if (token == null) {
            CodyStatus.CodyNotSignedIn
          } else if (UpgradeToCodyProNotification.autocompleteRateLimitError.get() != null ||
              UpgradeToCodyProNotification.chatRateLimitError.get() != null) {
            CodyStatus.RateLimitError
          } else {
            CodyStatus.Ready
          }
      return oldStatus != status
    }
  }

  private fun updateCodyStatusBarIcons() {
    UIUtil.invokeLaterIfNeeded {
      val openProjects = ProjectManager.getInstance().openProjects
      openProjects.forEach { project ->
        project.takeIf { !it.isDisposed }?.let { CodyStatusBarWidget.update(it) }
      }
    }
  }

  private fun getStatus(): CodyStatus {
    synchronized(this) {
      return status
    }
  }

  override fun dispose() = Unit

  companion object {

    fun getCurrentStatus(): CodyStatus {
      return ApplicationManager.getApplication()
          .getService(CodyStatusService::class.java)
          .getStatus()
    }

    @JvmStatic
    fun notifyApplication(status: CodyStatus) {
      ApplicationManager.getApplication()
          .messageBus
          .syncPublisher(CodyStatusListener.TOPIC)
          .onCodyAutocompleteStatus(status)
    }

    @JvmStatic
    fun resetApplication(project: Project) {
      ApplicationManager.getApplication()
          .messageBus
          .syncPublisher(CodyStatusListener.TOPIC)
          .onCodyAutocompleteStatusReset(project)
    }
  }
}
