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
class CodyAutocompleteStatusService : CodyAutocompleteStatusListener, Disposable {

  @GuardedBy("this") private var status: CodyAutocompleteStatus = CodyAutocompleteStatus.CodyUninit

  init {
    ApplicationManager.getApplication()
        .messageBus
        .connect(this)
        .subscribe(CodyAutocompleteStatusListener.TOPIC, this)
  }

  override fun onCodyAutocompleteStatus(codyAutocompleteStatus: CodyAutocompleteStatus) {
    val notify =
        synchronized(this) {
          val oldStatus = status
          status = codyAutocompleteStatus
          return@synchronized oldStatus != codyAutocompleteStatus
        }
    if (notify) {
      updateCodyStatusBarIcons()
    }
  }

  override fun onCodyAutocompleteStatusReset(project: Project) {
    ApplicationManager.getApplication().executeOnPooledThread {
      if (!project.isDisposed) {
        val notify = didStatusChanged(project)
        if (notify) {
          updateCodyStatusBarIcons()
        }
      }
    }
  }

  private fun didStatusChanged(project: Project): Boolean {
    synchronized(this) {
      val oldStatus = status
      val service = ApplicationManager.getApplication().getService(CodyAccountManager::class.java)
      val token =
          CodyAuthenticationManager.instance
              .getActiveAccount(project)
              ?.let(service::findCredentials)
      status =
          if (!ConfigUtil.isCodyEnabled()) {
            CodyAutocompleteStatus.CodyDisabled
          } else if (!ConfigUtil.isCodyAutocompleteEnabled()) {
            CodyAutocompleteStatus.AutocompleteDisabled
          } else if (!CodyAgentService.isConnected(project)) {
            CodyAutocompleteStatus.CodyAgentNotRunning
          } else if (token == null) {
            CodyAutocompleteStatus.CodyNotSignedIn
          } else if (UpgradeToCodyProNotification.autocompleteRateLimitError.get() != null ||
              UpgradeToCodyProNotification.chatRateLimitError.get() != null) {
            CodyAutocompleteStatus.RateLimitError
          } else {
            CodyAutocompleteStatus.Ready
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

  private fun getStatus(): CodyAutocompleteStatus {
    synchronized(this) {
      return status
    }
  }

  override fun dispose() = Unit

  companion object {

    fun getCurrentStatus(): CodyAutocompleteStatus {
      return ApplicationManager.getApplication()
          .getService(CodyAutocompleteStatusService::class.java)
          .getStatus()
    }

    @JvmStatic
    fun notifyApplication(status: CodyAutocompleteStatus) {
      ApplicationManager.getApplication()
          .messageBus
          .syncPublisher(CodyAutocompleteStatusListener.TOPIC)
          .onCodyAutocompleteStatus(status)
    }

    @JvmStatic
    fun resetApplication(project: Project) {
      ApplicationManager.getApplication()
          .messageBus
          .syncPublisher(CodyAutocompleteStatusListener.TOPIC)
          .onCodyAutocompleteStatusReset(project)
    }
  }
}
